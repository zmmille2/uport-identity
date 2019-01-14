pragma solidity ^0.4.15;


contract Package {
    bytes32 public PackageHash; 
    address public Owner;
    address private NewOwner;
    uint private BlockNumber;

    function Package(bytes32 packageHash) public {
        Owner = msg.sender;
        PackageHash = packageHash;
        BlockNumber = block.number;
    }

    function AssignOwner(address owner) public {
        require(block.number == BlockNumber);
        Owner = owner;
    }

    function AcceptTransferOwner(address newOwner) public {
        require(msg.sender == Owner);
        if (NewOwner == newOwner) {
            Owner = newOwner;
        } 
            delete NewOwner;
    }
 
    function RequestOwnership(bytes32 packageHash ) public {
        require(NewOwner == 0x0);
        NewOwner = msg.sender;
        PackageHash = packageHash;
    }
}

contract PackageFactory {
    event PackageCreated(address packageAddress);

    function NewPackage(bytes32 packageHash) public {
        var p = new Package(packageHash);
        p.AssignOwner(msg.sender);
        PackageCreated(p);
    }
}
