const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = 40000;
const SERVER_ID = 'xbox5';  // Update this if needed

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

// Request counter
let requestCounter = 0;

function generateRandomString(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}




app.get('/run-test', async (req, res) => {
  const currentRequestId = ++requestCounter;
  const startTime = Date.now();
  const oneMinute = 60 * 1000;

  let success = 0;
  let fail = 0;
  let ran = 0;
  let exceptions = 0;

  console.log(`[${SERVER_ID}] [Req ${currentRequestId}] Starting test run for 60 seconds...`);

  while (Date.now() - startTime < oneMinute) {
    const sourceString = generateRandomString(50);

    // Move these out so they're visible in both try and catch
    const testNumber = Math.floor(Math.random() * 1000) + 1;
    const testName = `test ${testNumber}`;

    try {
      await pool.query(
        `UPDATE users SET test_string = $1 WHERE test_name = $2`,
        [sourceString, testName]
      );

      const result = await pool.query(
        `SELECT * FROM users WHERE test_name = $1`,
        [testName]
      );
      const row = result.rows[0];

      if (!row) {
        console.warn(`[${SERVER_ID}] [Req ${currentRequestId}] Row not found: ${testName}`);
        continue;
      }

      const dbString = (row.test_string || '').trim();
      if (dbString === sourceString) {
        await pool.query(
          `UPDATE users
             SET count_success      = count_success + 1,
                 integration_ran    = integration_ran + 1,
                 test_string        = NULL
           WHERE test_name = $1`,
          [testName]
        );
        success++;

        process.stdout.write('+');
      } else {
        await pool.query(
          `UPDATE users
             SET count_fail         = count_fail + 1,
                 integration_ran    = integration_ran + 1,
                 test_string        = NULL
           WHERE test_name = $1`,
          [testName]
        );
        console.log(`[${SERVER_ID}] [Req ${currentRequestId}] Fail recorded`);
        fail++;
        process.stdout.write('+');
      }

      ran++;
    } catch (err) {
      // Increment the exception counter in the database and locally
      await pool.query(
        `UPDATE users
           SET count_exception    = count_exception + 1,
               integration_ran    = integration_ran + 1,
               test_string        = NULL
         WHERE test_name = $1`,
        [testName]
      );
      console.log(`[${SERVER_ID}] [Req ${currentRequestId}] Exception recorded`);
      exceptions++;
      process.stdout.write('E');

      console.error(`[${SERVER_ID}] [Req ${currentRequestId}] Error: ${err.message}`);
    }

    // random sleep between 1s and 30s
    await new Promise(resolve =>
      setTimeout(resolve, Math.floor(Math.random() * 30000) + 1000)
    );
  }

  console.log(
    `[${SERVER_ID}] [Req ${currentRequestId}] Test complete: ` +
    `Success=${success}, Fail=${fail}, Ran=${ran}, Exceptions=${exceptions}`
  );
  res.json({ success, fail, ran, exceptions });
});

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`[${SERVER_ID}] Server running on port ${port}`);
});

