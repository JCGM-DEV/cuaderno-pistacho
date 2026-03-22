const FtpDeploy = require("ftp-deploy");
const ftpDeploy = new FtpDeploy();
require('dotenv').config();

if (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASS) {
    console.error("❌ ERROR: Faltan credenciales en el archivo .env");
    console.error("Por favor, renombra .env.template a .env y rellena tus datos de Hostalia.");
    process.exit(1);
}

const config = {
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    host: process.env.FTP_HOST,
    port: 21,
    localRoot: __dirname,
    remoteRoot: process.env.FTP_PATH || "/",
    include: ["*", "**/*"], // Sube todos los archivos de la carpeta actual
    exclude: [
        ".git/**",           /* Ignora Git */
        ".env",              /* IGNORA LAS CONTRASEÑAS POR SEGURIDAD */
        ".env.*",
        "node_modules/**",   /* Ignora carpetas locales Node */
        "deploy_ftp.js",     /* Ignora el propio script */
        "package.json",
        "package-lock.json",
        "**/*.md",           /* Ignora manuales para ahorrar espacio */
        "deploy_log.txt",
        "capacitor.config.json"
    ],
    deleteRemote: false, // ¡No borrar lo que ya hay en el servidor! (Para no borrar sqlite)
    forcePasv: true,     // Modo seguro FTP pasivo
    sftp: false
};

console.log("🚀 Iniciando despliegue FTP automático a " + config.host + "...");
console.log("Carpeta remota: " + config.remoteRoot);

ftpDeploy
    .deploy(config)
    .then(res => console.log("\n✅ ¡Despliegue FTP completado con éxito en Hostalia!"))
    .catch(err => {
        console.error("\n❌ Error grave durante el despliegue FTP:");
        console.error(err);
    });
