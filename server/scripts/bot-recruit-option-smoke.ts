import assert = require("node:assert/strict");
import { PacketSender } from "../src/main/typescript/elvarg/net/packet/PacketSender";
import { decodeServerPacket } from "../../client/network/packet/ServerBinaryDecoder";

const { registerBotStatusInteractions } = require("../plugins/bots/runtime/registerBotStatusInteractions");
let login: Function = () => {};
let playerOption: Function = () => {};
let process: Function = () => {};
const options: any[] = [];
const messages: string[] = [];
const owner = {
  isPlayerBot: () => false,
  getUsername: () => "Owner",
  getRelations: () => ({ getFriendsChatChannelName: () => "" }),
  getRights: () => null,
  getAttribute: () => null,
  setAttribute() {},
  getSession: () => ({ sendClientPacket: (frame: Buffer) => {
    options.push(decodeServerPacket(frame));
    return true;
  } }),
  getPacketSender: () => ({
    sendPlayerOption: PacketSender.prototype.sendPlayerOption.bind({ player: owner }),
    sendInteractionOption() {},
    sendMessage: (message: string) => messages.push(message),
  }),
};
const bot = { isPlayerBot: () => true };

registerBotStatusInteractions({
  botStatusReporter: {},
  api: {
    onPlayerLogin: (handler: Function) => { login = handler; },
    onPlayerProcess: (handler: Function) => { process = handler; },
    onPlayerOption: (handler: Function) => { playerOption = handler; },
  },
});

login({ player: owner });
assert.deepEqual(options, []);
process({ player: owner });
assert.deepEqual(options[0], {
  type: "player_option", payload: { slot: 5, option: "Recruit", priority: false },
});
process({ player: owner });
assert.equal(options.length, 1, "do not resend the option every tick");
const trade = { player: owner, target: bot, option: 2, handled: false };
playerOption(trade);
assert.equal(trade.handled, false);
const recruit = { player: owner, target: bot, option: 5, handled: false };
playerOption(recruit);
assert.equal(recruit.handled, true);
assert.deepEqual(messages, ["Set up a clan chat first to recruit bots."]);
console.log("bot recruit option smoke: passed");
