var Package = artifacts.require("Package");
var PackageFactory = artifacts.require("PackageFactory");

function SetAccount(x, address) {
  x.class_defaults.from = address;
}

contract('Package', function (accounts) {
  it("Owner should be msg.sender", async () => {
    const expectedAccount = accounts[1];
    SetAccount(Package, expectedAccount);
    const instance = await Package.new(0x00);
    assert.equal(expectedAccount, await instance.Owner(), 'Contract owner was incorrect');
  });
  it("Ensure PackageHash is set", async () => {
    const expected = '0x1000000000000000000000000000000000000000000000000000000000000000';
    const instance = await Package.new(0x1);
    assert.equal(expected, await instance.PackageHash(), 'PackageHash was not set correctly');
  });
  it("Complete successful transer", async () => {
    const createAccount = accounts[0];
    const transferAccount = accounts[1];
    SetAccount(Package, createAccount);
    const instance = await Package.new(0x1);
    await instance.TransferOwner(transferAccount);
    SetAccount(Package, transferAccount);
    await instance.AcceptOwnership(0x2);
    assert.equal(transferAccount, await instance.Owner(), 'Ownership transfer did not complete');
  });
});

contract('PackageFactory', function (accounts) {
  it("Create new contract using factory", async () => {
    const expectedAccount = accounts[0];
    SetAccount(PackageFactory, expectedAccount);
    const factory = await PackageFactory.deployed();
    const tx = await factory.NewPackage(0x1);
    const packageAddress = tx.logs[0].args.packageAddress;
    const package = await Package.at(packageAddress);
    assert.equal(expectedAccount, await package.Owner(), "Package ownership is incorrect");
  });
});