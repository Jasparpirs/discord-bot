module.exports = {
  token: process.env.TOKEN || "MTU1NDg3OTQ0MTEyMDAxMDMzMg.GOJbXY.12LiM9IXttQPUR8f90So9__R-ibIF7dqTCaNzQ",
  dashboardPort: process.env.PORT || 3000,
  dashboardSecret: process.env.DASH_SECRET || "aether123",
  supportRoleName: "Support",
  ticketCategoryName: "TICKETS",
  muteRoleName: "Muted",
  xpCooldownMs: 15000,
  xpPerMessage: [10, 20],
  startBalance: 100,
  currency: "Aether Coins"
};
