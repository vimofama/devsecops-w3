# Reto: Validar un gate DevSecOps — AulaPay

App Express de un solo archivo (`src/app.js`) con el endpoint vulnerable de comprobantes de pago, evaluada por un gate real de **Semgrep** en GitHub Actions. El gate cubre 4 hallazgos: SQL Injection, BOLA/IDOR (ambos bloqueantes), y secreto expuesto + dependencia vulnerable (ambos no bloqueantes, requieren una decisión humana).

## Estructura

- `src/app.js` — la app completa en un único archivo: Express, "DB" en memoria, middleware de autenticación mock y el endpoint `GET /api/payments/:studentId`.
- `.env.example` — reproduce el hallazgo de secret scan del enunciado (`STRIPE_API_KEY=sk_test_...`).
- `package.json` — incluye la dependencia ficticia vulnerable del enunciado (`pdf-generator-lib@2.4.1`).
- `.semgrep/blocking.yml` — 2 reglas que **sí** detienen el pipeline (se escanean con `--error`):
  - `aulapay-sql-injection-string-concat` (ERROR) — concatenación de variable en SQL.
  - `aulapay-missing-object-authorization` (ERROR) — ruta autenticada que no valida que el recurso pertenezca al usuario (BOLA/IDOR).
- `.semgrep/informational.yml` — 2 reglas que **no** detienen el pipeline (se escanean sin `--error`):
  - `aulapay-possible-secret` (WARNING) — token con formato de clave en `.env.example`.
  - `aulapay-vulnerable-dependency` (WARNING) — versión vulnerable de `pdf-generator-lib` en `package.json`.
- `.github/workflows/semgrep.yml` — único workflow, dos steps de Semgrep en cada `push`: uno informativo (sin `--error`) y uno bloqueante (con `--error`).

**Nota técnica:** en Semgrep, la bandera `--error` hace fallar el comando ante *cualquier* hallazgo sin importar su severidad — poner `severity: WARNING` en una regla no la vuelve "no bloqueante" por sí sola. Por eso las reglas están separadas en dos archivos y dos comandos de escaneo distintos, no en un único `.semgrep/rules.yml` con `--error`.

Todo se ejecuta en GitHub Actions. No hace falta instalar Semgrep ni nada más en local.

## Cómo usarlo

1. Sube este repositorio a GitHub (`git init`, `git add`, `git commit`, `git remote add origin ...`, `git push`).
2. Con el código tal como está ahora, el workflow **Semgrep SAST** debe fallar en rojo: hay 2 hallazgos bloqueantes (SQL Injection y BOLA/IDOR) y 2 no bloqueantes (secreto, dependencia).
3. Corrige el SQL Injection (bloque más abajo), haz commit y push. El pipeline seguirá en rojo, ahora solo por BOLA/IDOR.
4. Corrige el BOLA/IDOR (bloque más abajo), haz commit y push. El pipeline debe pasar a **verde** — pero seguirá mostrando (sin bloquear) los 2 hallazgos WARNING de secreto y dependencia, no algo que el código deba "arreglar" para que el gate pase.

## 1. Corregir SQL Injection

**Código actual (vulnerable):**

```javascript
const query =
  "SELECT id, student_id, amount, payment_date, receipt_url " +
  "FROM payments WHERE student_id = " +
  studentId;

const result = await db.query(query);
```

**Código corregido — pégalo tal cual:**

```javascript
const query =
  "SELECT id, student_id, amount, payment_date, receipt_url " +
  "FROM payments WHERE student_id = $1";

const result = await db.query(query, [studentId]);
```

`studentId` deja de concatenarse dentro del SQL y pasa a un placeholder parametrizado (`$1`). Esto silencia la regla `aulapay-sql-injection-string-concat`.

## 2. Corregir BOLA/IDOR

**Código actual (vulnerable):** el handler nunca compara el usuario autenticado con el recurso solicitado — cualquier `studentId` autenticado puede pedir los comprobantes de cualquier otro.

**Agregar esta validación al inicio del handler, antes de construir la consulta:**

```javascript
if (req.user.studentId !== studentId) {
  return res.status(403).json({ error: "Forbidden: no tiene acceso a este recurso" });
}
```

Esto silencia la regla `aulapay-missing-object-authorization` y corresponde exactamente al hallazgo `API_SECURITY_TEST` del enunciado (esperado `403`, antes se obtenía `200`).

## Sobre los hallazgos no bloqueantes (WARNING)

- **Secreto** (`aulapay-possible-secret` sobre `.env.example`): Semgrep seguirá reportándolo aunque el pipeline esté en verde. La decisión (confirmar si es real, tratarlo como falso positivo justificado, etc.). No se "corrige" borrando el archivo — es intencional para mostrar cómo el gate distingue entre bloquear y decidir.
- **Dependencia vulnerable** (`aulapay-vulnerable-dependency` sobre `package.json`): igual, queda como WARNING permanente mientras `pdf-generator-lib` siga en `2.4.1`. Si en algún momento se actualiza a `2.4.3` en `package.json`, el hallazgo desaparece.
