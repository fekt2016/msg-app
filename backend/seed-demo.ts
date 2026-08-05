import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from './src/config/env.js';
import { UserModel } from './src/modules/auth/user.model.js';

const PASSWORD = 'Password123!';
const accounts = [
  { email: 'ama.demo@eaz.test', displayName: 'Ama Demo' },
  { email: 'kofi.demo@eaz.test', displayName: 'Kofi Demo' },
];

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URL);
  for (const a of accounts) {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const doc = await UserModel.findOneAndUpdate(
      { email: a.email },
      {
        $set: {
          email: a.email,
          displayName: a.displayName,
          passwordHash,
          isVerified: true,
          status: 'VERIFIED',
          role: 'USER',
          deletedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`seeded ${a.email} (_id=${doc?._id.toString()})`);
  }
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
