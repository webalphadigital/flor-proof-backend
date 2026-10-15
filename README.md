# Flor Proof backend

Serverless functions (Vercel, Node.js, ethers v6) that sign transactions on behalf of growers and florists, so they never have to handle a wallet.

Part of **Flor Proof**, a flower traceability platform built for the Monad Metropolis hackathon. Frontend and project overview: https://github.com/webalphadigital/webalphadigital.github.io/tree/main/Flor-Proof

## Endpoints

Both accept `POST` with a JSON body and answer with JSON. Error messages come back in English or Spanish, depending on the `lang` field (`"en"` or `"es"`).

### `POST /api/registrar` (grower)

Records a new batch in the contract.

| Field | Description |
|---|---|
| `codigo` | Access code of the grower |
| `idLote` | Batch code. Letters, numbers, dots, hyphens and underscores, up to 60 characters. Each code can be used once |
| `variedad` | One of the allowed varieties |
| `zona` | One of the allowed zones |
| `temporada` | Season, free text, up to 60 characters |
| `paquetes` | Number of packages, integer from 1 to 1,000,000 |
| `vidaUtilDias` | Shelf life in days, integer from 1 to 365 |
| `fechaCosecha` | Harvest date, `YYYY-MM-DD` |
| `lang` | `"en"` or `"es"` |

Success: `{ "ok": true, "hash": "0x…", "idLote": "…" }`

### `POST /api/florista` (florist)

| Field | Description |
|---|---|
| `codigo` | Access code of the florist |
| `accion` | `"confirmar"` (confirm receipt of a batch) or `"ramo"` (make a bouquet) |
| `idLote` | Batch code |
| `idRamo` | Bouquet code, only for `"ramo"` |
| `lang` | `"en"` or `"es"` |

A bouquet can only be created by the florist who confirmed that batch.

## Environment variables

Set them in Vercel (Settings → Environment Variables). **Never commit values to this repository.**

| Name | Purpose |
|---|---|
| `CONTRACT_ADDRESS` | Address of the deployed FlorProof contract |
| `CODIGO_P1` … `CODIGO_P5` | Access codes for growers |
| `CLAVE_P1` … `CLAVE_P5` | Signing key paired with each grower code (same number) |
| `CODIGO_F1` … `CODIGO_F5` | Access codes for florists |
| `CLAVE_F1` … `CLAVE_F5` | Signing key paired with each florist code (same number) |
| `RPC_URL` | Optional. Defaults to the public Monad Testnet RPC |
| `ORIGEN_PERMITIDO` | Optional. Origin allowed by CORS. Defaults to the project's frontend |

Each access code selects its own signing key. Wallets must be authorized in the contract by its admin before they can sign.

## Security notes

- Signing keys live only in environment variables.
- Access codes are compared in constant time.
- Inputs are validated (length, allowed characters, allowed values, numeric ranges).
- CORS is limited to the frontend's origin.
- Contract errors are decoded into clear messages.

## Deploy

1. Import this repository in Vercel.
2. Set the environment variables above.
3. **Redeploy** after changing any variable, or the functions keep using the old values.
4. Check `https://<your-project>.vercel.app/api/registrar`: it should answer `{"error":"Method not allowed"}`.

## Contact

fabianfigueroac@gmail.com

## License

Copyright 2026 Alpha Digital. All rights reserved. The code is public so it can be reviewed; it may not be copied, modified or redistributed without written permission.
