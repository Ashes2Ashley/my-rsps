import { strict as assert } from "node:assert";
import { PasswordUtil } from "../src/main/typescript/elvarg/util/PasswordUtil";

async function main(): Promise<void> {
    const password = "correct-password";
    const hash = await PasswordUtil.generatePasswordHashWithSalt(password);

    assert.equal(await PasswordUtil.passwordsMatch(password, hash), true);
    assert.equal(await PasswordUtil.passwordsMatch("wrong-password", hash), false);
    assert.equal(
        await PasswordUtil.passwordsMatch("wrong-password", `${"a".repeat(32)}:$2b$10$not-a-scrypt-hash`),
        false,
    );
}

main().then(() => console.log("Password utility smoke test: SUCCESS"));
