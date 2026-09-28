"""Tag derivation (slice S2t).

Covers the three upstream steps — ``extractHashtags``,
``buildHashTagTreeFromHashString``, and the ``handleAddTags`` upsert — plus the
note-level integration that makes ``notes.relatedNotes`` work again.
"""

import asyncio

from app.domain.notes import NoteService
from app.domain.tagging import (
    TagDerivation,
    build_hash_tag_tree,
    extract_hashtags,
)
from app.domain.users import normalize_id
from tests.fakes import FakeDb

ACCOUNT = 1
OTHER = 2


def _run(coro):
    return asyncio.run(coro)


def _rows(db, table):
    return _run(db.select(table))


def _by_name(db, table="tag"):
    return {row["name"]: row for row in _rows(db, table)}


def test_extract_hashtags_requires_a_word_boundary():
    assert extract_hashtags("hello #alpha world") == ["#alpha"]
    assert extract_hashtags("#alpha") == ["#alpha"]
    assert extract_hashtags("mid#word") == []
    assert extract_hashtags("a #one #two") == ["#one", "#two"]


def test_extract_hashtags_ignores_code_blocks_and_urls():
    assert extract_hashtags("text ``` #nope ``` #yes") == ["#yes"]
    assert extract_hashtags("see https://x.test//#frag #real") == ["#real"]


def test_extract_hashtags_keeps_nested_paths():
    assert extract_hashtags("body #parent/child end") == ["#parent/child"]


def test_extract_hashtags_handles_empty_and_none():
    assert extract_hashtags("") == []
    assert extract_hashtags(None) == []


def test_build_hash_tag_tree_folds_paths_into_parents():
    tree = build_hash_tag_tree(["#a/b", "#a/c", "#a/b/d"])
    assert [node["name"] for node in tree] == ["a"]
    a = tree[0]
    assert [node["name"] for node in a["children"]] == ["b", "c"]
    b = next(node for node in a["children"] if node["name"] == "b")
    assert [node["name"] for node in b["children"]] == ["d"]


def test_derive_creates_tags_and_links_for_the_note():
    db = FakeDb()
    derivation = TagDerivation(db)

    ids = _run(derivation.derive(ACCOUNT, 7, "note with #alpha and #beta"))

    assert len(ids) == 2
    tags = _by_name(db)
    assert set(tags) == {"alpha", "beta"}
    assert all(row["accountId"] == ACCOUNT for row in tags.values())
    assert all(row["parent"] == 0 for row in tags.values())
    links = _rows(db, "tagsToNote")
    assert {link["noteId"] for link in links} == {7}
    assert {link["tagId"] for link in links} == {
        normalize_id(row["id"]) for row in tags.values()
    }


def test_derive_links_the_parent_chain():
    db = FakeDb()
    derivation = TagDerivation(db)

    _run(derivation.derive(ACCOUNT, 1, "#parent/child"))

    tags = _by_name(db)
    assert set(tags) == {"parent", "child"}
    assert tags["parent"]["parent"] == 0
    assert tags["child"]["parent"] == normalize_id(tags["parent"]["id"])
    linked = {link["tagId"] for link in _rows(db, "tagsToNote")}
    assert linked == {
        normalize_id(tags["parent"]["id"]),
        normalize_id(tags["child"]["id"]),
    }


def test_derive_is_idempotent_and_reuses_tags_across_notes():
    db = FakeDb()
    derivation = TagDerivation(db)

    _run(derivation.derive(ACCOUNT, 1, "#shared"))
    _run(derivation.derive(ACCOUNT, 2, "#shared"))
    _run(derivation.derive(ACCOUNT, 1, "#shared"))

    assert len(_rows(db, "tag")) == 1
    assert len(_rows(db, "tagsToNote")) == 2


def test_derive_prunes_links_for_removed_tokens():
    db = FakeDb()
    derivation = TagDerivation(db)

    _run(derivation.derive(ACCOUNT, 1, "#keep #drop"))
    _run(derivation.derive(ACCOUNT, 1, "#keep"))

    remaining = _rows(db, "tagsToNote")
    keep = _by_name(db)["keep"]
    assert [link["tagId"] for link in remaining] == [normalize_id(keep["id"])]


def test_derive_scopes_tags_to_the_account():
    db = FakeDb()
    derivation = TagDerivation(db)

    mine = _run(derivation.derive(ACCOUNT, 1, "#mine"))
    theirs = _run(derivation.derive(OTHER, 2, "#mine"))

    assert len(_rows(db, "tag")) == 2
    assert mine != theirs


def test_upsert_derives_tags_from_the_body():
    db = FakeDb()
    service = NoteService(db)

    note = _run(service.upsert(ACCOUNT, {"content": "body #alpha"}))
    linked = _rows(db, "tagsToNote")
    assert len(linked) == 1
    assert linked[0]["noteId"] == note["id"]

    _run(service.upsert(ACCOUNT, {"id": note["id"], "content": "body #beta"}))
    tags = _by_name(db)
    assert set(tags) == {"alpha", "beta"}
    linked = _rows(db, "tagsToNote")
    assert len(linked) == 1
    assert linked[0]["tagId"] == normalize_id(tags["beta"]["id"])


def test_related_notes_now_finds_tag_overlap_from_derivation():
    db = FakeDb()
    service = NoteService(db)

    async def run():
        first = await service.upsert(ACCOUNT, {"content": "one #topic"})
        second = await service.upsert(ACCOUNT, {"content": "two #topic"})
        third = await service.upsert(ACCOUNT, {"content": "three #other"})
        return first, second, third

    first, second, third = _run(run())
    related = _run(service.related(first["id"], ACCOUNT))
    assert [row["id"] for row in related] == [second["id"]]
    assert third["id"] not in [row["id"] for row in related]
