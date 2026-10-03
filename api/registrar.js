// Backend de Flor Proof (Vercel). La clave de firma vive SOLO en las variables de entorno.
const { ethers } = require("ethers");
const crypto = require("crypto");

const ABI = [
  "function declararLote((string idLote,string variedad,string zona,string temporada,uint32 paquetes,uint64 fechaCosecha,uint16 vidaUtilDias) d) returns (bytes32)",
  "error NoEsProductor()", "error DatosInvalidos()", "error LoteYaExiste()"
];
const VARIEDADES = ["Gladiolos", "Rosas", "Claveles", "Lilium", "Gerberas"];
const ZONAS = ["Ramal - Yuto", "Quebrada - Maimara", "Quebrada - Tilcara", "Valles - Perico"];
const MENSAJES = {
  NoEsProductor: "La wallet de esta productora todavía no está autorizada en el contrato.",
  LoteYaExiste: "Ese código de lote ya existe. Probá con otro.",
  DatosInvalidos: "Datos inválidos."
};

// Cada productora tiene un código de acceso (CODIGO_P1..P5) y su propia clave de firma (CLAVE_P1..P5).
function claveDe(codigo) {
  const recibido = Buffer.from(String(codigo || ""));
  for (let i = 1; i <= 5; i++) {
    const c = process.env["CODIGO_P" + i], k = process.env["CLAVE_P" + i];
    if (!c || !k) continue;
    const esperado = Buffer.from(c);
    if (recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado)) return k;
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ORIGEN_PERMITIDO || "https://webalphadigital.github.io");
