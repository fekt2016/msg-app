import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from './src/config/env.js';
import { UserModel } from './src/modules/auth/user.model.js';
import { StoryModel } from './src/modules/stories/story.model.js';

/**
 * Seeds 10 mock VIDEO stories, visible to every user (the stories feed is
 * global). Idempotent: re-running deletes the previous mock batch first (matched
 * by the `mock-story-` publicId prefix), so it never piles up duplicates.
 *
 *   cd backend && npx tsx --env-file-if-exists=.env seed-stories.ts
 */

const PASSWORD = 'Password123!';
const MOCK_PREFIX = 'mock-story';
// Mock stories persist longer than the 24h product TTL so demos keep showing
// them; still eventually TTL-purged.
const MOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const creators = [
  { email: 'ama.demo@eaz.test', displayName: 'Ama Demo' },
  { email: 'kofi.demo@eaz.test', displayName: 'Kofi Demo' },
  { email: 'yaa.demo@eaz.test', displayName: 'Yaa Demo' },
  { email: 'kwame.demo@eaz.test', displayName: 'Kwame Demo' },
  { email: 'esi.demo@eaz.test', displayName: 'Esi Demo' },
];

// Public sample MP4s that return 200 video/mp4. All clips are short (~10s) and
// ~1MB so full-screen emulator playback never exhausts the app heap — the old
// seed used a 249MB 1080p movie (bunny/movie.mp4) and samplelib URLs that now
// 301 to an HTML error page, which OOM'd / failed playback on device.
const videos: { url: string; caption: string; durationMs: number }[] = [
  {
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    caption: 'Bunny 360p 🐰',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
    caption: 'Jellyfish 360p 🪼',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
    caption: 'Sintel 360p ⚔️',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    caption: 'Bunny in 720p 🐰',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4',
    caption: 'Jellyfish 🪼',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4',
    caption: 'Sintel 720p ⚔️',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4',
    caption: 'Bunny 1080p 🐰',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_1MB.mp4',
    caption: 'Jellyfish 1080p 🪼',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_1MB.mp4',
    caption: 'Sintel 1080p ⚔️',
    durationMs: 10000,
  },
  {
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4',
    caption: 'Bunny extended 🐰',
    durationMs: 10000,
  },
];

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URL);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const authorIds: mongoose.Types.ObjectId[] = [];
  for (const c of creators) {
    const doc = await UserModel.findOneAndUpdate(
      { email: c.email },
      {
        $set: {
          email: c.email,
          displayName: c.displayName,
          passwordHash,
          isVerified: true,
          status: 'VERIFIED',
          role: 'USER',
          deletedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    authorIds.push(doc!._id);
  }

  // Idempotent: clear any previous mock batch before re-seeding.
  const removed = await StoryModel.deleteMany({
    'media.publicId': { $regex: `^${MOCK_PREFIX}-` },
  });

  const expiresAt = new Date(Date.now() + MOCK_TTL_MS);
  const docs = videos.map((v, i) => ({
    authorId: authorIds[i % authorIds.length],
    media: {
      publicId: `${MOCK_PREFIX}-${i + 1}`,
      url: v.url,
      width: 1280,
      height: 720,
      resourceType: 'VIDEO' as const,
      durationMs: v.durationMs,
    },
    caption: v.caption,
    expiresAt,
    viewCount: 0,
  }));

  const created = await StoryModel.insertMany(docs);
  console.log(
    `Removed ${removed.deletedCount} old mock stories; seeded ${created.length} mock VIDEO stories ` +
      `across ${creators.length} creators (visible to every user).`,
  );

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
