import { db } from './db'
import { ncp } from 'ncp'
import path from 'path'

export const tag = [
  {
    "id": 1,
    "name": "Welcome",
    "icon": "\uD83C\uDF89",
    "parent": 0
  },
  {
    "id": 2,
    "name": "Attachment",
    "icon": "\uD83D\uDD16",
    "parent": 1
  },
  {
    "id": 3,
    "name": "Code",
    "icon": "\uD83E\uDE84",
    "parent": 1
  },
  {
    "id": 4,
    "name": "To-Do",
    "icon": "✨",
    "parent": 1
  },
  {
    "id": 5,
    "name": "Multi-Level-Tags",
    "icon": "\uD83C\uDFF7\uFE0F",
    "parent": 1
  }
]

export const attachments: any = [
  {
    "id": 1,
    "isShare": false,
    "sharePassword": "",
    "name": "pic01.png",
    "path": "/api/file/pic01.png",
    "size": 1360952,
    "noteId": 2
  },
  {
    "id": 2,
    "isShare": false,
    "sharePassword": "",
    "name": "pic02.png",
    "path": "/api/file/pic02.png",
    "size": 971782,
    "noteId": 2
  },
  {
    "id": 3,
    "isShare": false,
    "sharePassword": "",
    "name": "pic03.png",
    "path": "/api/file/pic03.png",
    "size": 141428,
    "noteId": 2
  },
  {
    "id": 4,
    "isShare": false,
    "sharePassword": "",
    "name": "pic04.png",
    "path": "/api/file/pic04.png",
    "size": 589371,
    "noteId": 2
  },
  {
    "id": 5,
    "isShare": false,
    "sharePassword": "",
    "name": "pic06.png",
    "path": "/api/file/pic06.png",
    "size": 875361,
    "noteId": 2
  },
  {
    "id": 6,
    "isShare": false,
    "sharePassword": "",
    "name": "story.txt",
    "path": "/api/file/story.txt",
    "size": 0,
    "noteId": 2
  }
]

export const notes = [
  {
    "id": 1,
    "type": 0,
    "content": "#Welcome\n\nWelcome to PlanInc!\n\nWhether you're capturing ideas, taking meeting notes, or planning your schedule, PlanInc provides an easy and efficient way to manage it all. Here, you can create, edit, and share notes anytime, anywhere, ensuring you never lose a valuable thought.",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 2,
    "type": 0,
    "content": "#Welcome/Attachment",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 3,
    "type": 0,
    "content": "#Welcome/Code\n\n\n\n```js\nfunction Welcome(){\n  console.log(\"Hello! PlanInc\");\n}\n```",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 4,
    "type": 0,
    "content": "#Welcome/To-Do\n\n* Create a planinc\n* Create a note\n* Upload file",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 5,
    "type": 0,
    "content": "#Welcome/Multi-Level-Tags\n\nUse the \"/\" shortcut to effortlessly create and organize multi-level tags.",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  },
  {
    "id": 6,
    "type": 0,
    "content": "https://github.com/mammhoud/planinc/",
    "isArchived": false,
    "isRecycle": false,
    "isShare": false,
    "isTop": false,
    "sharePassword": ""
  }
]

export const tagsToNote = [
  {
    "id": 1,
    "noteId": 1,
    "tagId": 1
  },
  {
    "id": 2,
    "noteId": 2,
    "tagId": 1
  },
  {
    "id": 3,
    "noteId": 2,
    "tagId": 2
  },
  {
    "id": 4,
    "noteId": 3,
    "tagId": 1
  },
  {
    "id": 5,
    "noteId": 3,
    "tagId": 3
  },
  {
    "id": 6,
    "noteId": 4,
    "tagId": 1
  },
  {
    "id": 7,
    "noteId": 4,
    "tagId": 4
  },
  {
    "id": 8,
    "noteId": 5,
    "tagId": 1
  },
  {
    "id": 9,
    "noteId": 5,
    "tagId": 5
  }
]

export async function createSeed(accountId: number) {
  try {
    const hasNotes = await db.notes.findMany();
    if (hasNotes.length == 0) {
      await db.notes.createMany({
        data: notes.map(note => ({
          ...note,
          accountId
        }))
      });

      await db.tag.createMany({
        data: tag.map(t => ({
          ...t,
          accountId
        }))
      });

      await db.tagsToNote.createMany({ data: tagsToNote });
      await db.attachments.createMany({ data: attachments });

      const seedDir = path.resolve(__dirname, 'seedfiles');
      ncp(seedDir, ".planinc/files", (err) => {
        if (err) {
          console.log(err)
        }
      })
    }
  } catch (error) {
    console.error('createSeed error', error)
  }
}
