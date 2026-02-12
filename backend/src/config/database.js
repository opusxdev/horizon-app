import mongoose from 'mongoose';
mongoose.set('bufferCommands', false);

class Database {
  constructor() {
    this.connection = null;
  }

  async connect(uri) {
    try {
      const options = {
        maxPoolSize: 10,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        w: 'majority'
      };

      console.log('connecting to Mongo atlas');
      this.connection = await mongoose.connect(uri, options);


      console.log('mongo connection successfull');

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error('mongo connection error', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('mongodb disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('mongodb reconnected');
      });

      mongoose.connection.on('connected', () => {
        console.log('mongodb connected to database', mongoose.connection.name);
      });

      return this.connection;
    } catch (error) {
      console.error('mongodb connection failed:', error.message);
      throw error;
    }

  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      console.log('MongoDB disconnected');
    }
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }
}

export default new Database();