const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cnltwph.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const testsCollection = client.db("primeLabDB").collection("tests");
    const usersCollection = client.db("primeLabDB").collection("users");
    const bannerCollection = client.db("primeLabDB").collection("banner");
    const reservationsCollection = client.db("primeLabDB").collection("reservations");
    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });
    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access " });
        }
        req.decoded = decoded;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      next();
    };

    // users api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.patch("/users/:email", async (req, res) => {
      const user = req.body;
      const email = req.params.email;
      const filter = { email: email };
      const updatedDoc = {
        $set: {
          name: user.name,
          bloodGroup: user.bloodGroup,
          district: user.district,
          upazila: user.upazila,
          photoURL: user.photoURL,
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.patch(
      "/users/:action/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const action = req.params.action;
        const filter = { _id: new ObjectId(id) };
        let updatedDoc;

        if (action === "admin") {
          updatedDoc = { $set: { role: "admin" } };
        } else if (action === "block") {
           updatedDoc = { $set: { status: "blocked" } };
        } else {
          return res.status(400).send({ error: "Invalid action" });
        }
        
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    app.get(
      "/users/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "unauthorized access" });
        }
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user?.role === "admin";
        }
        res.send({ admin });
      }
    );

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // create-payment-intent
    app.post("/create-payment-intent",verifyToken, async (req, res) => {
      const {price} = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"]
        
       
    })
    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  })
    app.get("/tests", async (req, res) => {
      const result = await testsCollection.find().toArray();
      res.send(result);
    });
    app.post("/tests", verifyToken, verifyAdmin, async (req, res) => {
      const test = req.body;
      const result = await testsCollection.insertOne(test);
      res.send(result);
    });
    app.delete("/tests/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await testsCollection.deleteOne(query);
      res.send(result);
    });

    // get single test data
    app.get("/test/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await testsCollection.findOne(query);
      res.send(result);
    });
    app.post("/banner", verifyToken, verifyAdmin, async (req, res) => {
      const banner = req.body;
      const result = await bannerCollection.insertOne(banner);
      res.send(result);
    });
    app.get("/banners", async (req, res) => {
      const result = await bannerCollection.find().toArray();
      res.send(result);
    });
    app.patch("/banners/:id", async (req, res) => {
      
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      try {
        await bannerCollection.updateMany({}, { $set: { isActive: false } });
    const updatedDoc = {
          $set: {
            isActive: true,
          },
        };
        const result = await bannerCollection.updateOne(filter, updatedDoc);
     res.send(result);
      } catch (error) {
        console.log(error.message);
      }
    });

    app.post("/reservations", verifyToken, async (req, res) => {
      const reservations = req.body;
      const result = await reservationsCollection.insertOne(reservations);
      const testId = reservations?.testId
      const query = {_id: new ObjectId(testId)}
      const updatedDoc = {
        $inc: { slots: -1 },
      }
      const updatedTest = await testsCollection.updateOne(query, updatedDoc);
      console.log(updatedTest)
      res.send({result, updatedTest});
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("PrimeLab server is running.");
});

app.listen(port, () => {
  console.log(`PrimeLab server is running on port ${port}`);
});
