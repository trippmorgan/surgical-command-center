const { Sequelize } = require("sequelize"); // Correct import using destructuring
require("dotenv").config();

// Ensure all required environment variables are present
if (
  !process.env.DB_NAME ||
  !process.env.DB_USER ||
  !process.env.DB_PASSWORD ||
  !process.env.DB_HOST
) {
  throw new Error(
    "Missing required database environment variables (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST)"
  );
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connection has been established successfully.");
    return true;
  } catch (error) {
    // This is the error you would see if the database was missing or credentials were wrong
    console.error("❌ Unable to connect to the database:", error.message);
    return false;
  }
};

const initDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log("✅ Database synchronized successfully.");
  } catch (error) {
    console.error("❌ Error synchronizing the database:", error);
  }
};

module.exports = {
  sequelize,
  testConnection,
  initDatabase,
};
