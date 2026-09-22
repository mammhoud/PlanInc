import express from 'express';
import archiver from 'archiver';
import { db } from '../../db';
import { getTokenFromRequest } from '../../lib/helper';
import { FileService } from '../../lib/files';

const router = express.Router();

function normalizeFolderPath(value: string) {
  const segments = value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) return null;
  return segments.join(',');
}

function safeArchiveSegment(value: string) {
  return value.replace(/[\\/]/g, '_').replace(/\.\./g, '_');
}

router.post('/', async (req, res) => {
  const token = await getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const attachmentIds = Array.isArray(req.body?.attachmentIds)
    ? req.body.attachmentIds.filter((id: unknown): id is number => Number.isInteger(id)).slice(0, 100)
    : [];
  const rawFolderPaths = Array.isArray(req.body?.folderPaths)
    ? req.body.folderPaths
      .filter((path: unknown): path is string => typeof path === 'string' && path.trim())
      .slice(0, 20)
    : [];
  const folderPaths = rawFolderPaths.map(normalizeFolderPath);
  if (folderPaths.some((path) => !path)) {
    return res.status(400).json({ error: 'Invalid folder path' });
  }
  const normalizedFolderPaths = folderPaths.filter((path): path is string => Boolean(path));

  if (!attachmentIds.length && !normalizedFolderPaths.length) {
    return res.status(400).json({ error: 'Select at least one file or folder' });
  }

  const accountId = Number(token.id);
  const attachments = await db.attachments.findMany({
    where: {
      OR: [
        { id: { in: attachmentIds }, accountId },
        ...normalizedFolderPaths.flatMap((folderPath) => [
          { perfixPath: folderPath, accountId },
          { perfixPath: { startsWith: `${folderPath},` }, accountId },
        ]),
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
    const folder = attachment.perfixPath
      ? `${String(attachment.perfixPath).split(',').map(safeArchiveSegment).join('/')}/`
      : '';
    archive.append(content, { name: `${folder}${safeArchiveSegment(attachment.name)}` });
  }

  await archive.finalize();
});

export default router;
