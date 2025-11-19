import { PrismaClient } from '@prisma/client';

class DatabaseConnection {
  constructor() {
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  async connect(retries = 3, delay = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.prisma.$connect();
        console.log('✅ Database connected successfully');

        // Test the connection
        await this.prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection verified');
        return;
      } catch (error) {
        console.error(`❌ Database connection failed (Attempt ${attempt}/${retries}):`, error.message);

        if (attempt === retries) {
          console.error('❌ All connection attempts failed');
          throw error;
        }

        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async disconnect() {
    try {
      await this.prisma.$disconnect();
      console.log('✅ Database disconnected successfully');
    } catch (error) {
      console.error('❌ Database disconnection failed:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }

  getPrismaClient() {
    return this.prisma;
  }
}

// Create a singleton instance
const databaseConnection = new DatabaseConnection();

export { databaseConnection };
export default databaseConnection.getPrismaClient();