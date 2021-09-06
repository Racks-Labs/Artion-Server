require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const ethers = require("ethers");
const router = require("express").Router();

const ERC721CONTRACT = mongoose.model("ERC721CONTRACT");
const ERC1155CONTRACT = mongoose.model("ERC1155CONTRACT");
const ERC1155HOLDING = mongoose.model("ERC1155HOLDING");
const Category = mongoose.model("Category");
const NFTITEM = mongoose.model("NFTITEM");
const Like = mongoose.model("Like");

const service_auth = require("./middleware/auth.tracker");
const toLowerCase = require("../utils/utils");

const provider = new ethers.providers.JsonRpcProvider(rpcapi, chainID);

const SimplifiedERC721ABI = require("../constants/simplifiederc721abi");
const SimplifiedERC1155ABI = require("../constants/simplifiederc1155abi");

const bannedCollections = new Map();
const loadedContracts = new Map();

const loadContract = (contractAddress, tokenType) => {
  let sc = loadedContracts.get(contractAddress);
  if (sc) return sc;
  else {
    let abi = tokenType == 721 ? SimplifiedERC721ABI : SimplifiedERC1155ABI;
    sc = new ethers.Contract(contractAddress, abi, provider);
  }
};

const getTokenUri = async (contractAddress, tokenID) => {
  let sc = loadedContracts.get(contractAddress);
  if (sc) {
    let uri = await sc.uri(tokenID);
    return uri;
  } else {
    sc = new ethers.Contract(contractAddress, SimplifiedERC1155ABI, provider);
    loadedContracts.set(contractAddress, sc);
    let uri = await sc.uri(tokenID);
    return uri;
  }
};

const getSupply = async (contractAddress, tokenID, ownerAddress) => {
  let sc = loadedContracts.get(contractAddress);
  if (sc) {
    let balance = await sc.balanceOf(ownerAddress, tokenID);
    return balance;
  } else {
    sc = new ethers.Contract(contractAddress, SimplifiedERC1155ABI, provider);
    loadedContracts.set(contractAddress, sc);
    let balance = await sc.balanceOf(ownerAddress, tokenID);
    return balance;
  }
};

const is712CollectionBanned = async (contractAddress) => {
  let isBanned = bannedCollections.get(contractAddress);
  if (isBanned) return true;
  try {
    let contract_721 = await ERC721CONTRACT.findOne({
      address: contractAddress,
      isAppropriate: false,
    });
    if (contract_721) {
      bannedCollections.set(contractAddress, true);
      return true;
    } else {
      bannedCollections.set(contractAddress, false);
      return false;
    }
  } catch (error) {
    return false;
  }
};

const is1155CollectionBanned = async (contractAddress) => {
  let isBanned = bannedCollections.get(contractAddress);
  if (isBanned) return true;
  try {
    let contract_1155 = await ERC1155CONTRACT.findOne({
      address: contractAddress,
      isAppropriate: false,
    });
    if (contract_1155) {
      bannedCollections.set(contractAddress, true);
      return true;
    } else {
      bannedCollections.set(contractAddress, false);
      return false;
    }
  } catch (error) {
    return false;
  }
};

const removeLike = async (contractAddress, tokenID) => {
  try {
    await Like.remove({
      contractAddress: contractAddress,
      tokenID: tokenID,
    });
  } catch (error) {}
};

const handle1155SingleTransfer = async (
  from,
  to,
  contractAddress,
  tokenID,
  value
) => {
  try {
    let tk = await NFTITEM.findOne({
      contractAddress: contractAddress,
      tokenID: tokenID,
    });
    let fromSupply = await getSupply(contractAddress, tokenID, from);
    let db_fromSupply = await ERC1155HOLDING.findOne({
      contractAddress: contractAddress,
      tokenID: tokenID,
      holderAddress: from,
    });
    if (!db_fromSupply) {
    }
    db_fromSupply = parseInt(db_fromSupply.supplyPerHolder);
    if (db_fromSupply == fromSupply) {
    }
    if (to == validatorAddress) {
      // burn -- only when token already exists
      if (tk) {
        let supply = tk.supply;
        if (supply == value) {
          // this is the final burn
          try {
            await tk.remove();
            await ERC1155HOLDING.deleteMany({
              contractAddress: contractAddress,
              tokenID: tokenID,
            });
            await removeLike(contractAddress, tokenID);
          } catch (error) {}
        } else {
          // now remove the supply
          supply = supply - value;
          tk.supply = supply;
          await tk.save();
          let holding = await ERC1155HOLDING.findOne({
            contractAddress: contractAddress,
            tokenID: tokenID,
            holderAddress: from,
          });
          holding = parseInt(holding.supplyPerHolder) - value;
          await holding.save();
        }
      } else {
        return res.json({});
      }
    } else if (from == validatorAddress) {
      // mint
      let toSupply = await getSupply(contractAddress, tokenID, to);
      let db_toSupply = await ERC1155HOLDING.findOne({
        contractAddress: contractAddress,
        tokenID: tokenID,
        holderAddress: to,
      });
      if (db_toSupply) {
        if (db_toSupply.supplyPerHolder != toSupply) {
          db_toSupply.supplyPerHolder = toSupply;
          await db_toSupply.save();
        }
      } else {
        // this is a new mint
        let tk = await NFTITEM.findOne({
          contractAddress: contractAddress,
          tokenID: tokenID,
        });
        if (!tk) {
          try {
            let newTk = new NFTITEM();
            newTk.contractAddress = contractAddress;
            newTk.tokenID = tokenID;
            newTk.supply = value;
            newTk.createdAt = new Date();
            let tokenUri = await getTokenUri(contractAddress, tokenID);
            newTk.tokenURI = tokenUri ? tokenUri : "https://";
            newTk.tokenType = 1155;
            let isBanned = await is1155CollectionBanned(contractAddress);
            newTk.isAppropriate = !isBanned;
            await newTk.save();
          } catch (error) {}
        }
        let holding = await ERC1155HOLDING.findOne({
          contractAddress: contractAddress,
          tokenID: tokenID,
          holderAddress: to,
        });
        if (!holding) {
          try {
            // now update the holdings collection
            let holding = new ERC1155HOLDING();
            holding.contractAddress = contractAddress;
            holding.tokenID = tokenID;
            holding.holderAddress = to;
            holding.supplyPerHolder = value;
            await holding.save();
          } catch (error) {}
        }
      }
    } else {
      // transfer
      let fromSupply = await getSupply(contractAddress, tokenID, from);
      let toSupply = await getSupply(contractAddress, tokenID, to);
      let db_fromSupply = await ERC1155HOLDING.findOne({
        contractAddress: contractAddress,
        tokenID: tokenID,
        holderAddress: from,
      });
      let db_toSupply = await ERC1155HOLDING.findOne({
        contractAddress: contractAddress,
        tokenID: tokenID,
        holderAddress: to,
      });
      if (db_fromSupply) {
        try {
          if (parseInt(db_fromSupply.supplyPerHolder) != fromSupply) {
            db_fromSupply.supplyPerHolder = fromSupply;
            await db_fromSupply.save();
          }
        } catch (error) {}
      }
      if (db_toSupply) {
        try {
          if (parseInt(db_toSupply.supplyPerHolder) != toSupply) {
            db_toSupply.supplyPerHolder = toSupply;
            await db_toSupply.save();
          }
        } catch (error) {}
      } else {
        try {
          // now update the holdings collection
          let holding = new ERC1155HOLDING();
          holding.contractAddress = contractAddress;
          holding.tokenID = tokenID;
          holding.holderAddress = to;
          holding.supplyPerHolder = toSupply;
          await holding.save();
        } catch (error) {}
      }
    }
  } catch (error) {}
};

router.post(
  "/handle721Transfer",
  /*service_auth,*/ async (req, res) => {
    try {
      let address = toLowerCase(req.body.address); //contract address
      let to = toLowerCase(req.body.to); // transferred to
      let tokenID = parseInt(req.body.tokenID); //tokenID
      let erc721token = await NFTITEM.findOne({
        contractAddress: address,
        tokenID: tokenID,
      });

      if (erc721token) {
        if (to == erc721token.owner) {
          return res.json({});
        }
        if (to == validatorAddress) {
          await erc721token.remove();
          await removeLike(address, tokenID);
          return res.json();
        } else {
          erc721token.owner = to;
          let now = Date.now();
          try {
            if (erc721token.createdAt > now) erc721token.createdAt = now;
          } catch (error) {
            console.log("error 11");
          }
          await erc721token.save();
          return res.json({});
        }
      } else {
        let sc = loadContract(address, 721);
        let tokenURI = await sc.tokenURI(tokenID);
        let metadata = await axios.get(tokenURI);
        let tokenName = "";
        let imageURL = "";
        try {
          tokenName = metadata.data.name;
          imageURL = metadata.data.image;
        } catch (error) {}
        if (to == validatorAddress) {
          return res.json();
        } else {
          let newTk = new NFTITEM();
          newTk.contractAddress = address;
          newTk.tokenID = tokenID;
          newTk.name = tokenName;
          newTk.tokenURI = tokenURI;
          newTk.imageURL = imageURL;
          newTk.owner = to;
          newTk.createdAt = Date.now();
          let isBanned = await is712CollectionBanned(address);
          newTk.isAppropriate = !isBanned;
          await newTk.save();
          return res.json();
        }
      }
    } catch (error) {
      return res.json({});
    }
  }
);

router.post(
  "/handle1155SingleTransfer",
  /*service_auth,*/ async (req, res) => {
    try {
      let address = toLowerCase(req.body.address);
      let from = toLowerCase(req.body.from);
      let to = toLowerCase(req.body.to);
      let id = parseInt(req.body.id);
      let value = parseInt(req.body.value);
      await handle1155SingleTransfer(from, to, address, id, value);
      return res.json();
    } catch (error) {
      return res.json({});
    }
  }
);

router.post(
  "/handle1155URI",
  /*service_auth,*/ async (req, res) => {
    try {
      let address = toLowerCase(req.body.address);
      let id = parseInt(req.body.id);
      let value = req.body.value;
      let tk = await NFTITEM.findOne({
        contractAddress: address,
        tokenID: id,
      });
      if (!tk) {
      } else {
        let _tkURI = tk.tokenURI;
        if (_tkURI == "https://") {
          tk.tokenURI = value;
        }
        try {
          let metadata = await axios.get(_tkURI);
          let name = metadata.data.name;
          let imageURL = metadata.data.image;
          tk.imageURL = imageURL;
          tk.name = name;
          tk.thumbnailPath = "-";
        } catch (error) {
          tk.name = "";
        }
        await tk.save();
        return res.json();
      }
    } catch (error) {
      return res.json();
    }
  }
);

router.post(
  "/handle1155BatchTransfer",
  /*service_auth,*/ async (req, res) => {
    try {
      let address = toLowerCase(req.body.address);
      let from = toLowerCase(req.body.from);
      let to = toLowerCase(req.body.to);
      let ids = req.body.id;
      ids = ids.split(",");
      let values = req.body.value;
      values = values.split(",");
      let promises = ids.map(async (_, index) => {
        operator = toLowerCase(operator);
        from = toLowerCase(from);
        to = toLowerCase(to);
        let id = ids[index];
        id = parseFloat(id.toString());
        let value = values[index];
        value = parseFloat(value.toString());
        await handleTransferSingle(from, to, address, id, value);
      });
      await Promise.all(promises);
      return res.json({});
    } catch (error) {
      return res.json();
    }
  }
);

module.exports = router;
