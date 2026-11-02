const production = process.env.NODE_ENV === 'production';
module.exports = {
  dialect: 'mssql', host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 1433), database: process.env.DB_NAME || 'TripAgencySecure',
  username: process.env.DB_USER || '', password: process.env.DB_PASSWORD || '', logging: false,
  dialectOptions: { options: {
    encrypt: production || process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: !production && process.env.DB_TRUST_CERTIFICATE === 'true',
    ...(process.env.DB_INSTANCE ? { instanceName: process.env.DB_INSTANCE } : {})
  } },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
};
