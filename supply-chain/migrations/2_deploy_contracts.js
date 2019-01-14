var Package = artifacts.require("Package");
var PackageFactory = artifacts.require("PackageFactory");

module.exports = function(deployer) {
  deployer.deploy(Package);
  deployer.deploy(PackageFactory);
};
