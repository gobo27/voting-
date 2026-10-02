//API FRAMEWORD
const express = require('express');
//CROSS ORIGIN RESOURCE SHARING
const cors = require('cors');
//ENVIRONMENT VARIABLES
require ('dotenv').config();
//DATABASE CONNECTION
const db=require('./config/db.js');
//ROUTES
const routes = require('./routes/index.js');

//UTILIZATION OF EXPRESS
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true})) //this will allow to read the url body tags

//use routes
app.use('/api', routes)

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
})