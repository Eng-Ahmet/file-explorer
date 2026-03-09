import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  permissions: {
    canUpload: boolean;
    canView: boolean;
    canDelete: boolean;
    canShare: boolean;
    canSeeOthersFiles: boolean;
    permittedUsers: mongoose.Types.ObjectId[];
  };
  monitoredBy?: mongoose.Types.ObjectId;
  isActive: boolean;
  storageQuota: number; // in bytes
  totalStorageUsed: number; // in bytes
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  isActive: { type: Boolean, default: true },
  storageQuota: { type: Number, default: 100 * 1024 * 1024 }, // 100MB Default
  totalStorageUsed: { type: Number, default: 0 },
  permissions: {
    canUpload: { type: Boolean, default: true },
    canView: { type: Boolean, default: true },
    canDelete: { type: Boolean, default: true },
    canShare: { type: Boolean, default: true },
    canSeeOthersFiles: { type: Boolean, default: false },
    permittedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  monitoredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);
