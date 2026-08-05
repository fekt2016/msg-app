import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Eaz Community API',
      version: '0.1.0',
      description: 'REST API for the Eaz Community platform (Express.js + TypeScript).',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: ['src/modules/**/*.routes.ts', 'src/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
