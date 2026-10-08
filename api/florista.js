// Backend de Flor Proof para florerías (Vercel). La clave de firma vive SOLO en las variables de entorno.
const { ethers } = require("ethers");
const crypto = require("crypto");

const ABI = [
  "function confirmarRecepcion(string idLote)",
  "function registrarRamo(string idRamo, string idLote)",
  "error NoEsFloreria()",
  "error LoteNoExiste()",
  "error LoteYaConfirmado()",
  "error LoteNoConfirmadoPorEstaFloreria()",
  "error RamoYaExiste()"
];

const MENSAJES = {
  NoEsFloreria: "La wallet de esta florería todavía no está autorizada en el contrato.",
  LoteNoExiste: "Ese lote no existe. Revisá el código.",
  LoteYaConfirmado: "Ese lote ya fue confirmado.",
  LoteNoConfirmadoPorEstaFloreria: "Primero tenés que confirmar la recepción de ese lote con esta florería.",
  RamoYaExiste: "Ese código de ramo ya existe. Probá con otro."
};

// Cada florería tiene un código de acceso (CODIGO_F1..F5) y su propia clave de firma (CLAVE_F1..F5).
function claveDe(codigo) {
  const recibido = Buffer.from(String(codigo || ""));
  for (let i = 1; i <= 5; i++) {
    const c = process.env["CODIGO_F" + i], k = process.env["CLAVE_F" + i];
    if (!c || !k) continue;
    const esperado = Buffer.from(c);
    if (recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado)) return k;
  }
  return null;
}
