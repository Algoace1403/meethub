import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMeetingServer } from './meeting-server.mjs';
import { getIceConfig } from './ice-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = createMeetingServer({
  origins: (
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,https://meethub-pink.vercel.app'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  maxParticipants: Math.min(
    4,
    Math.max(2, Number(process.env.MAX_PARTICIPANTS) || 4),
  ),
  maxRooms: Math.min(200, Math.max(1, Number(process.env.MAX_ROOMS) || 50)),
  iceConfig: await getIceConfig(process.env),
  staticDirectory: path.join(root, 'dist'),
});
app.server.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () =>
  console.log('Meet Hub server is ready.'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
