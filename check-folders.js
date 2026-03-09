import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/file-explorer';

const FolderSchema = new mongoose.Schema({
  name: String,
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const UserSchema = new mongoose.Schema({
  email: String,
  username: String
});

const Folder = mongoose.model('Folder', FolderSchema);
const User = mongoose.model('User', UserSchema);

async function check() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const folders = await Folder.find({ parentId: null });
  console.log(`Found ${folders.length} root folders:`);
  
  for (const f of folders) {
    const user = await User.findById(f.createdBy);
    console.log(`- Folder Name: "${f.name}", CreatedBy: ${f.createdBy}, User Email: ${user?.email || 'N/A'}`);
  }

  await mongoose.disconnect();
}

check().catch(console.error);
