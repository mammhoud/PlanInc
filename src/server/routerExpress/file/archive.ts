import express from 'express';
import archiver from 'archiver';
import { db } from '../../db';
import { getTokenFromRequest } from '../../lib/helper';
import { FileService } from '../../lib/files';

const router = express.Router();

router.post('/', async (req, res) => {
  const token = await getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const attachmentIds = Array.isArray(req.body?.attachmentIds)
    ? req.body.attachmentIds.filter((id: unknown): id is number => Number.isInteger(id)).slice(0, 100)
    : [];
  const folderPaths = Array.isArray(req.body?.folderPaths)
    ? req.body.folderPaths.filter((path: unknown): path is string => typeof path === 'string' && path.trim()).slice(0, 20)
    : [];

  if (!attachmentIds.length && !folderPaths.length) {
    return res.status(400).json({ error: 'Select at least one file or folder' });
  }

  const accountId = Number(token.id);
  const attachments = await db.attachments.findMany({
    where: {
      OR: [
        { id: { in: attachmentIds }, accountId },
        ...folderPaths.map((folderPath) => ({
          perfixPath: { startsWith: folderPath.replace(/[\\/]+/g, ',').replace(/^,|,$/g, '') },
          accountId,
        })),
      ],
    },
  });

  const files = attachments.filter((attachment) => attachment.name !== '.folder' && attachment.path);
  if (!files.length) return res.status(404).json({ error: 'No downloadable files found' });

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (error) => {
    console.error('Resource archive failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Archive creation failed' });
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="planinc-resources.zip"');
  archive.pipe(res);

  for (const attachment of files) {
    const content = await FileService.getFileBuffer(attachment.path);
    const folder = attachment.perfixPath ? `${String(attachment.perfixPath).split(',').join('/')}/` : '';
    archive.append(content, { name: `${folder}${attachment.name}` });
  }

  await archive.finalize();
});

export default router;
