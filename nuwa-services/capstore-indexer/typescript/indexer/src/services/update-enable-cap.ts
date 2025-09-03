import z from "zod";
import { queryFromSupabase, updateCapEnable } from "../supabase.js";
import { Result } from "../type.js";

async function updateEnableCap({ capId, action }: { capId: string, action: 'enable' | 'disable' }, context: any) {
  try {
    const userDID = context.session.did;
    // check if the user is the owner of the cap
    const caps = await queryFromSupabase(capId);
    if (caps.items || caps.items.length > 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 404,
            error: 'No matching records found',
          } as Result)
        }]
      }
    }

    const cap = caps.items[0];
    const capOwnerDID = cap.id.substring(0, cap.id.lastIndexOf(':') - 1);

    if (capOwnerDID !== userDID) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 403,
            error: 'You are not the owner of this cap',
          } as Result)
        }]
      };
    }

    let result = await updateCapEnable(capId, action === "enable");

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: 500,
            error: result.error || action === 'enable' ? 'Failed to enable cap' : 'Failed to disable cap',
          } as Result)
        }]
      };
    }

    // MCP standard response with pagination info
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 200,
        } as Result)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          code: 500,
          error: (error as Error).message || 'Unknown error occurred'
        } as Result)
      }]
    };
  }
}

export const updateEnableCapTool = {
  name: "updateEnableCap",
  description: "update enable cap",
  parameters: z.object({
    capId: z.string().describe("Cap ID"),
    action: z.enum(["enable", "disable"]).describe("Action to perform")
  }),
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  execute: updateEnableCap
};