const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

if (process.env.NODE_ENV === 'production') throw new Error('Esta tarea es solo para desarrollo local.');
if (['.env', '.env.migrations', '.env.test'].some(name => fs.existsSync(name))) {
  throw new Error('Ya existe configuración local. No se sobrescribirá.');
}
const appPassword = crypto.randomBytes(32).toString('hex') + '!Aa1';
const migrationPassword = crypto.randomBytes(32).toString('hex') + '!Aa1';
const sql = [
  "IF DB_ID(N'TripAgencySecure') IS NULL CREATE DATABASE [TripAgencySecure];",
  "IF DB_ID(N'TripAgencySecureTest') IS NULL CREATE DATABASE [TripAgencySecureTest];",
  "IF SUSER_ID(N'TripAgencyApp') IS NOT NULL OR SUSER_ID(N'TripAgencyMigrator') IS NOT NULL THROW 50001, 'Los usuarios ya existen; no se reemplazarán.', 1;",
  "CREATE LOGIN [TripAgencyApp] WITH PASSWORD = '" + appPassword + "', CHECK_POLICY = ON;",
  "CREATE LOGIN [TripAgencyMigrator] WITH PASSWORD = '" + migrationPassword + "', CHECK_POLICY = ON;",
  'USE [TripAgencySecure];',
  'CREATE USER [TripAgencyApp] FOR LOGIN [TripAgencyApp];',
  'ALTER ROLE [db_datareader] ADD MEMBER [TripAgencyApp];',
  'ALTER ROLE [db_datawriter] ADD MEMBER [TripAgencyApp];',
  'CREATE USER [TripAgencyMigrator] FOR LOGIN [TripAgencyMigrator];',
  'GRANT CREATE TABLE TO [TripAgencyMigrator];',
  'GRANT ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[dbo] TO [TripAgencyMigrator];',
  'USE [TripAgencySecureTest];',
  'CREATE USER [TripAgencyMigrator] FOR LOGIN [TripAgencyMigrator];',
  'GRANT CREATE TABLE TO [TripAgencyMigrator];',
  'GRANT ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[dbo] TO [TripAgencyMigrator];',
  'GO'
].join('\n');
try {
  execFileSync('sqlcmd', ['-S', 'localhost\\SQLEXPRESS', '-E', '-C', '-b', '-l', '5'], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
} catch {
  throw new Error('No se pudo preparar SQL Server local. Revisa el acceso de Windows y la instalación de SQLEXPRESS.');
}
const common = {
  NODE_ENV: 'development', PORT: '3000', DB_HOST: 'localhost', DB_PORT: '1433',
  DB_NAME: 'TripAgencySecure', DB_INSTANCE: 'SQLEXPRESS', DB_ENCRYPT: 'false', DB_TRUST_CERTIFICATE: 'true',
  SESSION_SECRET: crypto.randomBytes(48).toString('hex'),
  FRONTEND_ORIGINS: 'http://localhost:5173,http://localhost:3000', TRUST_PROXY_HOPS: '0'
};
for (const [name, settings] of [
  ['.env', { ...common, DB_USER: 'TripAgencyApp', DB_PASSWORD: appPassword }],
  ['.env.migrations', { ...common, DB_USER: 'TripAgencyMigrator', DB_PASSWORD: migrationPassword }],
  ['.env.test', { ...common, NODE_ENV: 'test', DB_NAME: 'TripAgencySecureTest', DB_USER: 'TripAgencyMigrator', DB_PASSWORD: migrationPassword }]
]) fs.writeFileSync(name, Object.entries(settings).map(([key, value]) => key + '=' + JSON.stringify(value)).join('\n') + '\n', { flag: 'wx' });
console.log('Bases y cuentas locales preparadas. Las credenciales están en archivos ignorados.');
