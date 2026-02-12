import mongoose from 'mongoose';

const elementSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  angle: { type: Number, default: 0 },
  strokeColor: { type: String, default: '#000000' },
  backgroundColor: { type: String, default: 'transparent' },
  fillStyle: { type: String, default: 'hachure' },
  strokeWidth: { type: Number, default: 1 },
  strokeStyle: { type: String, default: 'solid' },
  roughness: { type: Number, default: 1 },
  opacity: { type: Number, default: 100 },
  groupIds: [String],
  frameId: String,
  roundness: mongoose.Schema.Types.Mixed,
  seed: Number,
  version: Number,
  versionNonce: Number,
  isDeleted: { type: Boolean, default: false },
  boundElements: mongoose.Schema.Types.Mixed,
  updated: Number,
  link: String,
  locked: { type: Boolean, default: false },
  // Text element specific
  text: String,
  fontSize: Number,
  fontFamily: Number,
  textAlign: String,
  verticalAlign: String,
  baseline: Number,
  containerId: String,
  originalText: String,
  // Line/Arrow specific
  points: [[Number]],
  lastCommittedPoint: [Number],
  startBinding: mongoose.Schema.Types.Mixed,
  endBinding: mongoose.Schema.Types.Mixed,
  startArrowhead: String,
  endArrowhead: String,
  // Image specific
  fileId: String,
  scale: [Number],
  status: String,
  // Additional fields
  customData: mongoose.Schema.Types.Mixed
}, { _id: false, strict: false });

const appStateSchema = new mongoose.Schema({
  viewBackgroundColor: { type: String, default: '#ffffff' },
  gridSize: Number,
  scrollX: { type: Number, default: 0 },
  scrollY: { type: Number, default: 0 },
  zoom: { type: mongoose.Schema.Types.Mixed, default: { value: 1 } },
  currentItemStrokeColor: String,
  currentItemBackgroundColor: String,
  currentItemFillStyle: String,
  currentItemStrokeWidth: Number,
  currentItemStrokeStyle: String,
  currentItemRoughness: Number,
  currentItemOpacity: Number,
  currentItemFontFamily: Number,
  currentItemFontSize: Number,
  currentItemTextAlign: String,
  currentItemStartArrowhead: String,
  currentItemEndArrowhead: String,
  currentItemRoundness: String,
  name: String
}, { _id: false, strict: false });

const userSchema = new mongoose.Schema({
  socketId: { type: String, required: true },

  username: { type: String, default: 'Anonymous' },
  color: { type: String, required: true },
  pointer: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  selectedElementIds: [String],
  lastActive: { type: Date, default: Date.now }
}, { _id: false });

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  elements: { type: [mongoose.Schema.Types.Mixed], default: [] },
  appState: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ zoom: { value: 1 } })
  },
  files: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  activeUsers: [userSchema],
  version: {
    type: Number,
    default: 1
  },
  lastModified: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800 // Auto-delete after 7 days of creation
  }
}, {
  timestamps: true,
  strict: false
});

// Indexes for performance
roomSchema.index({ 'activeUsers.socketId': 1 });


// Methods
roomSchema.methods.addUser = function (socketId, username, color) {
  const existingUser = this.activeUsers.find(u => u.socketId === socketId);
  if (!existingUser) {
    this.activeUsers.push({
      socketId,
      username,
      color,
      pointer: { x: 0, y: 0 },
      selectedElementIds: [],
      lastActive: new Date()
    });
  }
  return this.save();
};

roomSchema.methods.removeUser = function (socketId) {
  this.activeUsers = this.activeUsers.filter(u => u.socketId !== socketId);
  return this.save();
};

roomSchema.methods.updateUserPointer = function (socketId, pointer) {
  const user = this.activeUsers.find(u => u.socketId === socketId);
  if (user) {
    user.pointer = pointer;
    user.lastActive = new Date();
  }
  return this.save();
};

roomSchema.methods.updateElements = function (elements) {
  this.elements = elements;
  this.version += 1;
  this.lastModified = new Date();
  return this.save();
};

roomSchema.methods.incrementalUpdate = function (updates) {
  const { added, updated, deleted } = updates;

  // Handle deleted elements
  if (deleted && deleted.length > 0) {
    this.elements = this.elements.filter(el => !deleted.includes(el.id));
  }

  // Handle updated elements
  if (updated && updated.length > 0) {
    updated.forEach(updatedEl => {
      const index = this.elements.findIndex(el => el.id === updatedEl.id);
      if (index !== -1) {
        this.elements[index] = { ...this.elements[index].toObject(), ...updatedEl };
      }
    });
  }

  // Handle added elements
  if (added && added.length > 0) {
    this.elements.push(...added);
  }

  this.version += 1;
  this.lastModified = new Date();
  return this.save();
};

// Pre-save hook to sanitize data and prevent NaN issues
roomSchema.pre('save', function (next) {
  if (this.appState) {
    // Force zoom to be an object with a numeric value
    let zoomVal = 1;
    if (this.appState.zoom) {
      const current = typeof this.appState.zoom === 'object' ? this.appState.zoom.value : this.appState.zoom;
      zoomVal = isNaN(current) || current <= 0 ? 1 : current;
    }
    this.appState.zoom = { value: zoomVal };

    if (isNaN(this.appState.scrollX)) this.appState.scrollX = 0;
    if (isNaN(this.appState.scrollY)) this.appState.scrollY = 0;
  }

  // Sanitize Elements
  if (this.elements && Array.isArray(this.elements)) {
    this.elements.forEach(el => {
      if (isNaN(el.x)) el.x = 0;
      if (isNaN(el.y)) el.y = 0;
      if (isNaN(el.width)) el.width = 0;
      if (isNaN(el.height)) el.height = 0;
    });
  }
  next();
});

const Room = mongoose.model('Room', roomSchema);
export default Room;
