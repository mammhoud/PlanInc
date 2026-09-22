import { userCaller } from '@server/routerTrpc/_app';
import { NoteType } from '@shared/lib/types';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod/v3';
import { verifyToken } from '@server/lib/helper';

export const upsertPlanIncTool = createTool({
  id: 'upsert-planinc-tool',
  description: 'You are a planinc assistant. You can create different types of content. "PlanInc" means flash thoughts or sudden inspiration - those fleeting ideas that pop into mind.',
  inputSchema: z.object({
    content: z.string().describe("The content to save. Tag is start with #"),
    type: z.string().optional().default('planinc').describe('Optional: The type of content: "planinc" (flash thoughts/sudden ideas/fleeting inspiration - the default), "note" (longer, structured content), or "todo" (tasks to be done)'),
    token: z.string().optional().describe("internal use, do not pass!")
  }),
  execute: async ({ context, runtimeContext }) => {
    const accountId = runtimeContext?.get('accountId') || (await verifyToken(context.token))?.sub;
    
    console.log(`create note:${context.content}, type:${context.type}, accountId:${accountId}`);
    
    // Convert string type to NoteType enum
    let noteType: NoteType;
    const typeStr = (context.type || 'planinc').toLowerCase();
    
    switch (typeStr) {
      case 'note':
      case '1':
        noteType = NoteType.NOTE; // 1
        break;
      case 'todo':
      case '2':
        noteType = NoteType.TODO; // 2
        break;
      case 'planinc':
      case '0':
      default:
        noteType = NoteType.PLANINC; // 0
        break;
    }
    
    try {
      const caller = userCaller({
        id: String(accountId),
        exp: 0,
        iat: 0,
        name: 'admin',
        sub: String(accountId),
        role: 'superadmin'
      })
      const note = await caller.notes.upsert({
        content: context.content,
        type: noteType,
      })
      console.log('Created note:', note)
      return note
    } catch (error) {
      console.log('Error creating note:', error)
      return error.message
    }
  }
});