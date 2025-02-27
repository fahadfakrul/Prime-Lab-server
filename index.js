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
    // await client.connect();

    const testsCollection = client.db("primeLabDB").collection("tests");
    const usersCollection = client.db("primeLabDB").collection("users");
    const bannerCollection = client.db("primeLabDB").collection("banner");
    const doctorsCollection = client.db("primeLabDB").collection("doctors");
    const feedbackCollection = client.db("primeLabDB").collection("feedback");
    const recommendationsCollection = client.db("primeLabDB").collection("recommendations");
    const reservationsCollection = client
      .db("primeLabDB")
      .collection("reservations");
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
    app.get("/doctors",  async (req, res) => {
      const result = await doctorsCollection.find().toArray();
      res.send(result);
    });
    app.patch("/users/:email",verifyToken, async (req, res) => {
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
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
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
    app.patch("/test/:id",verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          title: req.body.title,
          category: req.body.category,
          shortDescription: req.body.shortDescription,
          details: req.body.details,
          date: req.body.date,
          slots: req.body.slots,
          price: req.body.price,
          image: req.body.image
        }
      }
      const result = await testsCollection.updateOne(filter, updatedDoc);
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
    app.delete("/banners/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bannerCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/banners/:id",verifyToken,verifyAdmin, async (req, res) => {
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
    app.get("/recommendations", async (req, res) => {
      const result = await recommendationsCollection.find().toArray();
      res.send(result);
    });
    app.post("/feedback",  async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });
    app.post("/reservations", verifyToken, async (req, res) => {
      const reservations = req.body;
      const result = await reservationsCollection.insertOne(reservations);
      const testId = reservations?.testId;
      const query = { _id: new ObjectId(testId) };
      const updatedDoc = {
        $inc: { slots: -1 },
      };
      const updatedTest = await testsCollection.updateOne(query, updatedDoc);
      // console.log(updatedTest);
      res.send({ result, updatedTest });
    });

    app.get("/reservations", verifyToken,  async (req, res) => {
      const result = await reservationsCollection.find().toArray();
      res.send(result);
    });
    app.delete(
      "/reservations/:id",
      verifyToken,
      
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await reservationsCollection.deleteOne(query);
        res.send(result);
      }
    );
    app.get("/reservations/:email", verifyToken,  async (req, res) => {
      const email = req.params.email;
      const status = req.query.status || "delivered"; 
  const query = { email: email, reportStatus: status };
      const result = await reservationsCollection.find(query).toArray();
      res.send(result);
    });
    
    app.patch("/reservations/:id",verifyToken,verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { pdfLink, reportStatus } = req.body; 
      const updatedDoc = {
        $set: {
          pdfLink: pdfLink,
          reportStatus: reportStatus,
        },
      };
      const result = await reservationsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    app.get("/all-tests", async (req, res) => {
      const size = parseInt(req.query.size)
      const page = parseInt(req.query.page) - 1
    const result = await testsCollection.find().skip(page * size).limit(size).toArray();
    res.send(result);
    });
    app.get("/tests-count", async (req, res) => {
      const count = await testsCollection.countDocuments()
      res.send({count});
    });
    app.get('/admin-stats',verifyToken,verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount()
      const testItems = await testsCollection.estimatedDocumentCount()
      const reservations = await reservationsCollection.estimatedDocumentCount()

      const result = await reservationsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray()
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({
        users, testItems , reservations, revenue
      })
    })

    app.get('/booked-stats',verifyToken,verifyAdmin, async(req, res) => {
      const testStats = await reservationsCollection.aggregate([
        {
          $group: {
            _id: "$testName",
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            name: "$_id",
            count: 1
          }
        }
      ]).toArray()

      const reportStats = await reservationsCollection.aggregate([
        {
          $group: {
            _id: "$reportStatus",
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            name: "$_id",
            count: 1
          }
        }
      ]).toArray()
      res.send({testStats, reportStats})
    })
   
    app.get('/most-booked-tests', async (req, res) => {
      try {
        const pipeline = [
          { 
            "$group": { "_id": "$testId", "count": { "$sum": 1 } } 
          },
          { 
            "$sort": { "count": -1 } 
          },
          { 
            "$limit": 5 
          },
          { 
            "$addFields": { 
              "testId": { "$toString": "$_id" } 
            } 
          },
          { 
            "$lookup": {
              "from": "tests",
              "let": { "testId": "$testId" },
              "pipeline": [
                { "$match": { "$expr": { "$eq": [ "$_id", { "$toObjectId": "$$testId" } ] } } } 
              ],
              "as": "testDetails"
            }
          },
          { 
            "$unwind": "$testDetails" 
          },
          { 
            "$project": {
              "_id": "$_id",
              "count": 1,
              "title": "$testDetails.title",
              "shortDescription": "$testDetails.shortDescription",
              "price": "$testDetails.price",
              "image": "$testDetails.image",
              "category": "$testDetails.category",
              "date": "$testDetails.date",
              "slots": "$testDetails.slots"
            }
          }
        ];
        
        const mostBookedTests = await reservationsCollection.aggregate(pipeline).toArray();
        res.send(mostBookedTests);
      } catch (error) {
        console.error(error);
        res.status(500).send('Error retrieving most booked tests');
      }
    });
    

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
