// Backend de Flor Proof (Vercel). La clave de firma vive SOLO en las variables de entorno.
const { ethers } = require("ethers");
const crypto = require("crypto");

const ABI = [
  "function declararLote((string idLote,string variedad,string zona,string temporada,uint32 paquetes,uint64 fechaCosecha,uint16 vidaUtilDias) d)",
  "error NoEsProductor()",
  "error DatosInvalidos()",
  "error LoteYaExiste()"
];

const VARIEDADES = ["Gladiolos", "Rosas", "Claveles", "Lilium", "Gerberas"];
const ZONAS = ["Ramal - Yuto", "Quebrada - Maimara", "Quebrada - Tilcara", "Valles - Perico"];
const MENSAJES = {
  NoEsProductor: ["This grower's wallet is not yet authorized on the contract.", "La wallet de esta productora todavía no está autorizada en el contrato."],
  LoteYaExiste: ["That batch code already exists. Try another one.", "Ese código de lote ya existe. Probá con otro."],
  DatosInvalidos: ["Invalid data.", "Datos inválidos."]
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

const err = (res, code, msg) => res.status(code).json({ error: msg });

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
    const temporada = String(b.temporada || "").trim();
    if (!idLote || idLote.length > 60) return err(res, 400, tr("Batch code is empty or too long.", "Código de lote vacío o demasiado largo."));
    if (!/^[A-Za-z0-9._-]+$/.test(idLote)) return err(res, 400, tr("The batch code only accepts letters, numbers, dots, hyphens and underscores.", "El código de lote solo admite letras, números, punto, guion y guion bajo."));
    if (!VARIEDADES.includes(b.variedad)) return err(res, 400, tr("Invalid variety.", "Variedad no válida."));
    if (!ZONAS.includes(b.zona)) return err(res, 400, tr("Invalid zone.", "Zona no válida."));
    if (!temporada || temporada.length > 60) return err(res, 400, tr("Season is empty or too long.", "Temporada vacía o demasiado larga."));

    const paquetes = Number(b.paquetes), vida = Number(b.vidaUtilDias);
    if (!Number.isInteger(paquetes) || paquetes < 1 || paquetes > 1000000) return err(res, 400, tr("Invalid number of packages.", "Cantidad de paquetes no válida."));
    if (!Number.isInteger(vida) || vida < 1 || vida > 365) return err(res, 400, tr("Invalid shelf life (1 to 365 days).", "Vida útil no válida (1 a 365 días)."));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fechaCosecha))) return err(res, 400, tr("Invalid harvest date.", "Fecha de cosecha no válida."));
    const fecha = Math.floor(new Date(b.fechaCosecha + "T00:00:00Z").getTime() / 1000);
    if (!Number.isFinite(fecha) || fecha <= 0) return err(res, 400, tr("Invalid harvest date.", "Fecha de cosecha no válida."));

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://testnet-rpc.monad.xyz");
    const wallet = new ethers.Wallet(clave, provider);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet);

    const tx = await contrato.declararLote([idLote, b.variedad, b.zona, temporada, paquetes, fecha, vida]);
    await tx.wait();

    return res.status(200).json({ ok: true, hash: tx.hash, idLote });
  } catch (e) {
    let nombre = e && e.revert && e.revert.name;
    if (!nombre && e && e.data) {
      try { nombre = iface.parseError(e.data).name; } catch (_) {}
    }
    if (nombre && MENSAJES[nombre]) return err(res, 400, MENSAJES[nombre][esp ? 1 : 0]);

    console.error("Error al registrar:", e && e.message);
    return err(res, 500, tr("The batch could not be registered. Please try again.", "No se pudo registrar el lote. Intenta de nuevo."));
  }
};
