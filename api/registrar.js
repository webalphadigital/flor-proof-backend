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
   res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const iface = new ethers.Interface(ABI);

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    // 1) Código de acceso -> clave de firma (solo vive en las variables de Vercel)
    const clave = claveDe(body.codigo);
    if (!clave) return res.status(401).json({ error: "Código de acceso incorrecto." });
    if (!process.env.CONTRACT_ADDRESS) {
      console.error("Falta la variable CONTRACT_ADDRESS");
      return res.status(500).json({ error: "Servidor mal configurado." });
    }

    // 2) Validaciones básicas
    if (body.variedad !== undefined && !VARIEDADES.includes(body.variedad)) {
      return res.status(400).json({ error: "Variedad no válida." });
    }
    if (body.zona !== undefined && !ZONAS.includes(body.zona)) {
      return res.status(400).json({ error: "Zona no válida." });
    }

    // 3) Armar los datos del lote leyendo los campos desde el propio ABI
    const campos = iface.getFunction("declararLote").inputs[0].components;
    const valores = [];
    for (const campo of campos) {
      let v = body[campo.name];
      if (v === undefined || v === null || String(v).trim() === "") {
        return res.status(400).json({ error: "Falta el campo: " + campo.name });
      }
      if (campo.type.startsWith("uint")) {
        // Acepta fecha AAAA-MM-DD y la convierte a segundos
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          v = Math.floor(new Date(v + "T00:00:00Z").getTime() / 1000);
        }
        try { v = BigInt(v); } catch (e) {
          return res.status(400).json({ error: "Número inválido en: " + campo.name });
        }
        if (v < 0n) return res.status(400).json({ error: "Número inválido en: " + campo.name });
      } else {
        v = String(v).trim();
        if (v.length > 100) return res.status(400).json({ error: "Texto demasiado largo en: " + campo.name });
      }
      valores.push(v);
    }

    // 4) Firmar y enviar con la wallet de la productora
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://testnet-rpc.monad.xyz");
    const wallet = new ethers.Wallet(clave, provider);
    const contrato = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet);

    const tx = await contrato.declararLote(valores);
    await tx.wait();

    return res.status(200).json({ ok: true, hash: tx.hash, idLote: body.idLote });
  } catch (e) {
    // Errores del contrato (productora no autorizada, lote repetido, datos inválidos)
    let nombre = e && e.revert && e.revert.name;
    if (!nombre && e && e.data) {
      try { nombre = iface.parseError(e.data).name; } catch (_) {}
    }
    if (nombre && MENSAJES[nombre]) return res.status(400).json({ error: MENSAJES[nombre] });

    console.error("Error al registrar:", e && e.message);
    return res.status(500).json({ error: "No se pudo registrar el lote. Intenta de nuevo." });
  }
};
