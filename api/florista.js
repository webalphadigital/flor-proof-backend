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
  NoEsFloreria: ["This florist's wallet is not yet authorized on the contract.", "La wallet de esta florería todavía no está autorizada en el contrato."],
  LoteNoExiste: ["That batch does not exist. Check the code.", "Ese lote no existe. Revisá el código."],
  LoteYaConfirmado: ["That batch was already confirmed.", "Ese lote ya fue confirmado."],
  LoteNoConfirmadoPorEstaFloreria: ["You must first confirm receipt of that batch with this florist.", "Primero tenés que confirmar la recepción de ese lote con esta florería."],
  RamoYaExiste: ["That bouquet code already exists. Try another one.", "Ese código de ramo ya existe. Probá con otro."]
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

const err = (res, code, msg) => res.status(code).json({ error: msg });
const CODIGO_VALIDO = /^[A-Za-z0-9._-]+$/;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ORIGEN_PERMITIDO || "https://webalphadigital.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  const iface = new ethers.Interface(ABI);
  let esp = false;
  const tr = (en, es) => (esp ? es : en);

  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    esp = b.lang === "es";

    const clave = claveDe(b.codigo);
    if (!clave) return err(res, 401, tr("Incorrect access code.", "Código de acceso incorrecto."));
    if (!process.env.CONTRACT_ADDRESS) {
      console.error("Falta la variable CONTRACT_ADDRESS");
      return err(res, 500, tr("Server misconfigured.", "Servidor mal configurado."));
    }

    const idLote = String(b.idLote || "").trim();
    const idRamo = String(b.idRamo || "").trim();
    if (!idLote || idLote.length > 60 || !CODIGO_VALIDO.test(idLote)) return err(res, 400, tr("Invalid batch code.", "Código de lote no válido."));
    if (b.accion === "ramo" && (!idRamo || idRamo.length > 60 || !CODIGO_VALIDO.test(idRamo))) return err(res, 400, tr("Invalid bouquet code.", "Código de ramo no válido."));
    if (b.accion !== "confirmar" && b.accion !== "ramo") return err(res, 400, tr("Invalid action.", "Acción no válida."));

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://testnet-rpc.monad.xyz");
    const wallet = new ethers.Wallet(clave, provider);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet);

    const tx = b.accion === "confirmar"
      ? await contrato.confirmarRecepcion(idLote)
      : await contrato.registrarRamo(idRamo, idLote);
    await tx.wait();

    return res.status(200).json({ ok: true, hash: tx.hash, accion: b.accion, idLote, idRamo: b.accion === "ramo" ? idRamo : undefined });
  } catch (e) {
    let nombre = e && e.revert && e.revert.name;
    if (!nombre && e && e.data) {
      try { nombre = iface.parseError(e.data).name; } catch (_) {}
    }
    if (nombre && MENSAJES[nombre]) return err(res, 400, MENSAJES[nombre][esp ? 1 : 0]);

    console.error("Error en florista:", e && e.message);
    return err(res, 500, tr("The operation could not be completed. Please try again.", "No se pudo completar la operación. Probá de nuevo."));
  }
};
