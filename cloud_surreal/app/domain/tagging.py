"""Hash-tag derivation (slice S2t).

Ports the tag half of the ``notes.upsert`` write path in
``server/routerTrpc/note.ts``: hashtags found in a note body become ``tag``
rows (with ``parent`` chains for ``#a/b``) plus ``tagsToNote`` join rows, and
the links for tokens that disappeared from the body are pruned.

The upstream pipeline is three steps and all three are reproduced here:

- ``extractHashtags`` — strip fenced code blocks, then match ``#token`` at word
  boundaries, ignoring ``//#`` so URLs are not treated as tags.
- ``buildHashTagTreeFromHashString`` — split each token on ``/`` and fold it
  into a parent/child tree so ``#a/b`` links ``b`` under ``a``.
- ``handleAddTags`` — upsert the tag by ``(name, parent, accountId)`` and create
  the join row when it is missing.

The plan requires this before the seven ``tags.*`` mutations can be ported,
because ``updateTagName`` / ``updateTagMany`` rewrite note content and rely on
this derivation, and ``deleteOnlyTag`` garbage-collects tags whose usage count
reached zero. ``notes.relatedNotes`` and the analytics tag stats read the same
join table.

Deliberate deviation: a token with a trailing slash (``#a/``) would make the TS
tree insert a node with an empty name. Empty names are skipped here rather than
persisted as junk tag rows.
"""

from __future__ import annotations

import re
from typing import Any

from ..db.ids import next_id
from .users import normalize_id

TAG = "tag"
TAG_TO_NOTE = "tagsToNote"

_FENCED_CODE = re.compile(r"```[\s\S]*?```")


def extract_hashtags(content: str | None) -> list[str]:
    """Return the ``#tag`` tokens in ``content`` as ``#``-prefixed strings.

    Mirrors ``extractHashtags``: fenced code is removed first, then a token is
    recognised when ``#`` sits at the start of the string or after whitespace,
    is not preceded by ``//``, and runs until whitespace (or another ``#``).
    """
    if not content:
        return []
    text = _FENCED_CODE.sub("", str(content).replace("\\", ""))
    tokens: list[str] = []
    index = 0
    length = len(text)
    while index < length:
        if text[index] == "#":
            at_boundary = index == 0 or text[index - 1].isspace()
            after_scheme = index >= 2 and text[index - 2 : index] == "//"
            if at_boundary and not after_scheme:
                end = index + 1
                while end < length and not text[end].isspace() and text[end] != "#":
                    end += 1
                name = text[index + 1 : end]
                if name:
                    tokens.append("#" + name)
                    index = end
                    continue
        index += 1
    return tokens


def build_hash_tag_tree(tokens: list[str]) -> list[dict]:
    """Fold ``#a/b/c`` tokens into a parent/child tree (order preserved)."""
    root: list[dict] = []
    for token in tokens or []:
        parts = [part for part in str(token).replace("#", "").split("/") if part]
        nodes = root
        for name in parts:
            node = next((item for item in nodes if item["name"] == name), None)
            if node is None:
                node = {"name": name, "children": []}
                nodes.append(node)
            nodes = node["children"]
    return root


class TagDerivation:
    """Upserts tag + ``tagsToNote`` rows from a note's content."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def derive(
        self, account_id: int, note_id: Any, content: str | None
    ) -> list[int]:
        """Sync ``note_id``'s tag links with the hashtags in ``content``.

        Returns the ids of the tags the note links to after the sync.
        """
        target = normalize_id(note_id)
        if target is None:
            return []

        tree = build_hash_tag_tree(extract_hashtags(content))
        new_ids: list[int] = []

        async def walk(nodes: list[dict], parent: int) -> None:
            for node in nodes:
                tag_id = await self._ensure_tag(node["name"], parent, account_id)
                if tag_id is None:
                    continue
                new_ids.append(tag_id)
                if node.get("children"):
                    await walk(node["children"], tag_id)

        await walk(tree, 0)

        for row in await self._client.select(TAG_TO_NOTE):
            if normalize_id(row.get("noteId")) != target:
                continue
            tag_id = normalize_id(row.get("tagId"))
            if tag_id not in new_ids:
                link_id = normalize_id(row.get("id"))
                await self._client.delete(f"{TAG_TO_NOTE}:{link_id}")

        for tag_id in new_ids:
            await self._ensure_link(tag_id, target)
        return new_ids

    async def _ensure_tag(self, name: str, parent: int, account_id: int) -> int | None:
        if not name:
            return None
        for row in await self._client.select(TAG):
            if (
                row.get("name") == name
                and normalize_id(row.get("parent")) == parent
                and normalize_id(row.get("accountId")) == account_id
            ):
                return normalize_id(row.get("id"))
        tag_id = await next_id(self._client, TAG)
        await self._client.create(
            f"{TAG}:{tag_id}",
            {"name": name, "parent": parent, "accountId": account_id},
        )
        return tag_id

    async def _ensure_link(self, tag_id: int, note_id: int) -> None:
        for row in await self._client.select(TAG_TO_NOTE):
            if (
                normalize_id(row.get("tagId")) == tag_id
                and normalize_id(row.get("noteId")) == note_id
            ):
                return
        link_id = await next_id(self._client, TAG_TO_NOTE)
        await self._client.create(
            f"{TAG_TO_NOTE}:{link_id}", {"tagId": tag_id, "noteId": note_id}
        )
