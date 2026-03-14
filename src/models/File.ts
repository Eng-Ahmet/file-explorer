import mongoose, { Schema, Document } from 'mongoose';

export interface IFile extends Document {
  name: string;
  originalName: string;
  displayName: string;
  size: number;
  type: string;
  path: string;
  folderId: mongoose.Types.ObjectId | null;
  uploadedBy: mongoose.Types.ObjectId;
  sharedWith: mongoose.Types.ObjectId[];
  uploadDate: Date;
}

const FileSchema: Schema = new Schema({
  name: { type: String, required: true },
  originalName: { type: String, required: true },
  displayName: { type: String, required: true },
  size: { type: Number, required: true },
  type: { type: String, required: true },
  path: { type: String, required: true },
  folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sharedWith: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  uploadDate: { type: Date, default: Date.now }
});

export default mongoose.model<IFile>('File', FileSchema);
