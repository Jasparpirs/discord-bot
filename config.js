module.exports = {
  token: process.env.TOKEN || "SINU_BOT_TOKEN",
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
