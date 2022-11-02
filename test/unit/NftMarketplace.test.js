const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("NFT Marketplace Unit Tests", () => {
          let nftMarketplace, deployer, player, basicNft, playerConnectedNftMarketplace, accounts
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              accounts = await ethers.getSigners()
              player = accounts[1]
              await deployments.fixture(["all"])
              nftMarketplace = await ethers.getContract("NftMarketplace", deployer)
              playerConnectedNftMarketplace = nftMarketplace.connect(player)
              basicNft = await ethers.getContract("BasicNft", deployer)
              await basicNft.mintNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID)
          })

          describe("listItem", () => {
              it("reverts if item is not approved", async () => {
                  await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotApprovedForMarketplace()")
              })
              it("reverts if item already listed", async () => {
                  const error = `NftMarketplace__AlreadyListed("${basicNft.address}", ${TOKEN_ID})`
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error)
              })
              it("reverts if is not the owner", async () => {
                  await expect(
                      playerConnectedNftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("reverts if price is less or equal than zero", async () => {
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, 0)
                  ).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })
              it("updates mapping and emits an event", async () => {
                  await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit(
                      nftMarketplace,
                      "ItemListed"
                  )
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), PRICE)
                  assert.equal(listing.seller.toString(), deployer)
              })
          })

          describe("cancelListing", () => {
              //it("revert if is not the owner", async () => {})
              it("reverts if item is not listed", async () => {
                  const error = `NftMarketplace__NotListed("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith(error)
              })
              it("deletes from mapping and emits an event", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)).to.emit(
                      nftMarketplace,
                      "ItemCanceled"
                  )
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), "0")
                  assert.equal(
                      listing.seller.toString(),
                      "0x0000000000000000000000000000000000000000"
                  )
              })
          })

          describe("buyItem", () => {
              beforeEach(async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
              })
              it("reverts if the price isn't met", async () => {
                  const listedItem = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  const error = `NftMarketplace__PriceNotMet("${basicNft.address}", ${TOKEN_ID}, ${listedItem.price})`
                  await expect(
                      playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith(error)
              })
              it("updates the proceeds mapping", async () => {
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const proceed = await nftMarketplace.getProceeds(deployer)
                  assert.equal(proceed.toString(), PRICE)
              })
              it("deletes the item from the listings mapping and emits an event", async () => {
                  await expect(
                      playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  ).to.emit(nftMarketplace, "ItemBought")
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), "0")
                  assert.equal(
                      listing.seller.toString(),
                      "0x0000000000000000000000000000000000000000"
                  )
              })
              it("transfers correctly to the buyer's account", async () => {
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const newOwner = await basicNft.ownerOf(TOKEN_ID)
                  assert.equal(newOwner, player.address)
              })
          })

          describe("updateListing", () => {
              beforeEach(async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
              })
              it("reverts if the new price is equal or less than zero", async () => {
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, 0)
                  ).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero")
              })
              it("updates the listings mapping and emits an event", async () => {
                  const newPrice = ethers.utils.parseEther("0.02")
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  ).to.emit(nftMarketplace, "ItemListed")
                  const listedItem = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listedItem.price.toString(), newPrice)
              })
          })
          describe("withdrawProceeds", () => {
              it("reverts if proceeds are equal or less than zero", async () => {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                      "NftMarketplace__NoProceeds"
                  )
              })
              it("updates the proceeds mapping", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  await nftMarketplace.withdrawProceeds()
                  const proceeds = await nftMarketplace.getProceeds(deployer)
                  assert.equal(proceeds.toString(), "0")
              })
              it("transfer the proceeds to it's owner", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })
                  const deployerStartingBalance = await accounts[0].getBalance()
                  const tx = await nftMarketplace.withdrawProceeds()
                  const txResponse = await tx.wait(1)
                  const { gasUsed, effectiveGasPrice } = txResponse
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const deployerEndingBalance = await accounts[0].getBalance()
                  assert.equal(
                      deployerEndingBalance.toString(),
                      deployerStartingBalance.sub(gasCost).add(PRICE).toString()
                  )
              })
          })
      })
