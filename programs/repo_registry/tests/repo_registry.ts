import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

describe("repo_registry", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("placeholder", async () => {
    expect(true).to.equal(true);
  });
});