// Simple Convex interaction demo for the UNO schema
// Run from the workspace folder:
//   node scripts/demo.js

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.CONVEX_URL;
if (!url) {
  console.error("CONVEX_URL not set in .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(url);

async function main() {
  // 1) List any sample tasks (from quickstart)
  try {
    const tasks = await client.query(api.tasks.get);
    console.log("tasks:", tasks);
  } catch (e) {
    console.log("tasks.get failed (ok if not present):", e.message);
  }

  // 2) Players by wallet (replace with a known wallet to test)
  try {
    const wallet = process.env.DEMO_WALLET || "0x1234567890abcdef1234567890abcdef12345678";
    const player = await client.query(api.players.byWallet, { walletAddress: wallet });
    console.log("player.byWallet:", player);
  } catch (e) {
    console.log("players.byWallet failed:", e.message);
  }

  // 3) Games by room id (replace with a known id to test)
  try {
    const roomId = process.env.DEMO_ROOM_ID || "123";
    const game = await client.query(api.games.byRoomId, { roomId });
    console.log("games.byRoomId:", game);
    if (game?._id) {
      const latestState = await client.query(api.states.latestByGame, { gameId: game._id });
      console.log("states.latestByGame:", latestState);
    }
  } catch (e) {
    console.log("games/states queries failed:", e.message);
  }

  // 4) Moves by game (if we have a game id)
  try {
    const roomId = process.env.DEMO_ROOM_ID || "123";
    const game = await client.query(api.games.byRoomId, { roomId });
    if (game?._id) {
      const moves = await client.query(api.moves.byGame, { gameId: game._id });
      console.log("moves.byGame:", moves);
    }
  } catch (e) {
    console.log("moves.byGame failed:", e.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
