import mongoose, { Schema, Document } from 'mongoose';

export interface INote {
  text: string;
  user: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IPayment {
  amount: number;
  description: string;
  type: 'payment' | 'expense';
  date: Date;
  status: 'pending' | 'completed';
}

export interface IProject extends Document {
  name: string;
  description: string;
  admin: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  status: 'active' | 'completed' | 'archived';
  notes: INote[];
  payments: IPayment[];
  filesFolderId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const ProjectSchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },
  notes: [{
    text: String,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  payments: [{
    amount: Number,
    description: String,
    type: { type: String, enum: ['payment', 'expense'] },
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'completed'], default: 'completed' }
  }],
  filesFolderId: { type: Schema.Types.ObjectId, ref: 'Folder' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IProject>('Project', ProjectSchema);
