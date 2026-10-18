const { PrismaClient } = require('@prisma/client');

const prisma = globalThis.__podlivePrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__podlivePrisma = prisma;

module.exports = prisma;
