import { z } from 'zod';
import { router, authProcedure, superAdminAuthMiddleware } from '../middleware';
import { db } from '../db';

/**
 * Workspace branding.
 *
 * The logo can be pasted as a URL, picked from an existing image resource, or
 * generated with the configured image model. Generated images are stored as a
 * data URL on the config record, so a workspace never depends on an external
 * image host staying online.
 */

export const LOGO_CONFIG_KEY = 'customLogoUrl';
export const LOGO_PROMPT_CONFIG_KEY = 'customLogoPrompt';
/** Generated logos are small; refuse anything larger than this data URL. */
const MAX_LOGO_BYTES = 512 * 1024;

const logoInput = z.object({
  /** http(s) URL, data URL, or empty string to clear the logo. */
  url: z.string().trim().max(MAX_LOGO_BYTES),
});

export const brandingRouter = router({
  get: authProcedure
    .output(z.object({ url: z.string(), prompt: z.string() }))
    .query(async () => {
      const [logo, prompt] = await Promise.all([
        db.config.findFirst({ where: { key: LOGO_CONFIG_KEY } }),
        db.config.findFirst({ where: { key: LOGO_PROMPT_CONFIG_KEY } }),
      ]);
      return {
        url: String((logo?.config as any)?.value ?? ''),
        prompt: String((prompt?.config as any)?.value ?? ''),
      };
    }),

  setLogo: authProcedure
    .use(superAdminAuthMiddleware)
    .input(logoInput)
    .output(z.object({ url: z.string() }))
    .mutation(async ({ input }) => {
      const url = input.url.trim();
      if (url && !/^(https?:\/\/|data:image\/)/.test(url)) {
        throw new Error('The logo must be an http(s) or data:image URL');
      }
      if (url.startsWith('data:') && url.length > MAX_LOGO_BYTES) {
        throw new Error('That image is too large to store as a workspace logo');
      }
      const existing = await db.config.findFirst({ where: { key: LOGO_CONFIG_KEY } });
      const data = { key: LOGO_CONFIG_KEY, config: { type: 'string', value: url } };
      if (existing) await db.config.update({ where: { id: existing.id }, data });
      else await db.config.create({ data });
      return { url };
    }),

  /**
   * Search the workspace's image resources so a logo can be reused instead of
   * uploaded again.
   */
  searchImages: authProcedure
    .input(z.object({ query: z.string().trim().max(80).default(''), limit: z.number().int().min(1).max(50).default(24) }))
    .output(z.array(z.object({ id: z.number().int(), name: z.string(), path: z.string(), url: z.string() })))
    .query(async ({ ctx, input }) => {
      const where: any = { accountId: Number(ctx.id) };
      if (input.query) where.name = { contains: input.query, mode: 'insensitive' };
      const rows = await db.attachments.findMany({
        where,
        take: input.limit,
        orderBy: [{ createdAt: 'desc' }],
      });
      const imageLike = /(^image\/)|\.(png|jpe?g|gif|webp|svg|avif)$/i;
      return rows
        .filter((row: any) => imageLike.test(String(row.type ?? '')) || imageLike.test(String(row.path ?? '')))
        .map((row: any) => ({
          id: row.id,
          name: row.name ?? row.path ?? `#${row.id}`,
          path: row.path ?? '',
          url: row.path ?? '',
        }));
    }),

  /**
   * Generate a logo with the workspace's configured image model.
   *
   * The image model is an OpenAI-compatible provider already stored for the
   * workspace, so this calls `/images/generations` directly rather than adding
   * another SDK dependency.
   */
  generateLogo: authProcedure
    .use(superAdminAuthMiddleware)
    .input(z.object({ prompt: z.string().trim().min(4).max(400), size: z.enum(['256x256', '512x512', '1024x1024']).default('512x512') }))
    .output(z.object({ url: z.string(), model: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const modelIdRow = await db.config.findFirst({ where: { key: 'imageModelId' } });
      const modelId = (modelIdRow?.config as any)?.value;
      if (!modelId) throw new Error('Configure an image model first (Settings → AI → default models)');

      const model = await db.aiModels.findUnique({ where: { id: Number(modelId) }, include: { provider: true } });
      const provider = model?.provider;
      if (!provider?.baseUrl) throw new Error('The configured image model has no provider base URL');

      const endpoint = `${String(provider.baseUrl).replace(/\/$/, '')}/images/generations`;
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: model.modelKey ?? model.title,
            prompt: `${input.prompt}. Flat vector app logo, centred, generous padding, no text, transparent background.`,
            n: 1,
            size: input.size,
            response_format: 'b64_json',
          }),
        });
      } catch (error) {
        throw new Error(`Could not reach the image provider: ${(error as Error).message}`);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Image generation failed (${response.status}): ${detail.slice(0, 200)}`);
      }

      const payload: any = await response.json().catch(() => null);
      const first = payload?.data?.[0];
      let url = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : String(first?.url ?? '');
      if (first?.url && !first?.b64_json) {
        // Providers that only return a link are downloaded once so the logo does
        // not rot when the provider rotates its temporary URLs.
        try {
          const image = await fetch(String(first.url));
          if (image.ok) {
            const buffer = Buffer.from(await image.arrayBuffer());
            const contentType = image.headers.get('content-type') ?? 'image/png';
            url = `data:${contentType};base64,${buffer.toString('base64')}`;
          }
        } catch (error) {
          console.error('Logo download failed, keeping the provider URL', error);
        }
      }
      if (!url) throw new Error('The image provider returned no image');
      if (url.length > MAX_LOGO_BYTES) throw new Error('The generated image is too large to store as a logo');

      for (const [key, value] of [[LOGO_CONFIG_KEY, url], [LOGO_PROMPT_CONFIG_KEY, input.prompt]] as const) {
        const existing = await db.config.findFirst({ where: { key } });
        const data = { key, config: { type: 'string', value } };
        if (existing) await db.config.update({ where: { id: existing.id }, data });
        else await db.config.create({ data });
      }

      return { url, model: String(model.modelKey ?? model.title) };
    }),
});
