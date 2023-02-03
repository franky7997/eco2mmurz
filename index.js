const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const cors = require("cors");
const axios = require("axios").default;

const express = require("express");
const bodyParser = require("body-parser");
const { text } = require("body-parser");

const app = express();
const port = process.env.PORT || 80;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello World");
});

const getPageHTML = async (pageUrl) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();

  await page.setUserAgent(process.env.USER_AGENT);
  //   await page.setExtraHTTPHeaders({
  //     "user-agent":
  //       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54",
  //   });
  await page.goto(pageUrl, { waitUntil: "networkidle0" });

  const pageHTML = await page.evaluate(
    "new XMLSerializer().serializeToString(document.doctype) + document.documentElement.outerHTML"
  );

  await browser.close();
  return pageHTML;
};

const getShoesData = async () => {
  try {
    const res = await axios.get(process.env.LAMBDA_URL);
    return res.data;
  } catch (err) {
    return err.toString();
  }
};
// https://stackoverflow.com/questions/1129216/sort-array-of-objects-by-string-property-value
const sortShoesData = (shoesData) => {
  return shoesData.sort((a, b) => a.no - b.no);
};
// https://stackoverflow.com/questions/15125920/how-to-get-distinct-values-from-an-array-of-objects-in-javascript
const shoesMaterial = (shoesData) => {
  const uniqueShoes = [
    ...new Set(
      shoesData.map((item) => `${item.material}-${item.keyword.join(" ")}`)
    ),
  ];
  let reformShoes = [];
  uniqueShoes.forEach((item) => {
    reformShoes.push({
      material: item.split("-")[0],
      keyword: item.split("-")[1].split(" "),
    });
  });
  return reformShoes;
};

const findMaterialKeywords = (prodDesc, uniqueMaterials) => {
  for (let i = 0; i < uniqueMaterials.length; ++i) {
    for (let j = 0; j < uniqueMaterials[i].keyword.length; ++j) {
      if (prodDesc.includes(uniqueMaterials[i].keyword[j]))
        return uniqueMaterials[i];
    }
  }
  return {};
};

const findMaterialSizes = (shoesData, material) => {
  return shoesData.filter((item) => item.material === material);
};

// https://stackoverflow.com/questions/650022/how-do-i-split-a-string-with-multiple-separators-in-javascript
// const splitText = (text) => {
//   const removedSpecialCharText = text.replace(/[^a-zA-Z ]/g, " ");
//   return removedSpecialCharText.split(/[\s,]+/);
// };

const isEmptyObject = (obj) =>
  Object.keys(obj).length === 0 && obj.constructor === Object;

app.post("/api/v1/getProduct", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).send("Bad request: 'url' param is missing!");
    return;
  }

  try {
    const html = await getPageHTML(url);
    const $ = cheerio.load(html);
    // HTML Text Processing
    const tagP = $("p").text().toLowerCase();
    // const textArray = splitText(tagP);

    // Server Data Processing
    const shoesData = await getShoesData();
    const sortedShoes = sortShoesData(shoesData.Items);
    const uniqueShoes = shoesMaterial(shoesData.Items);
    const isShoesData = [
      {
        material: "shoes",
        keyword: ["spatu", "sepatu", "shoes"],
      },
    ];
    // const shoesResult = findMaterialKeywords(textArray, isShoesData);
    const shoesResult = findMaterialKeywords(tagP, isShoesData);
    // console.log(tagP);
    // console.log(textArray);
    // console.log(uniqueShoes);
    // console.log("IsShoes: " + JSON.stringify(shoesResult));
    if (isEmptyObject(shoesResult)) {
      res.status(200).send({ error: "Shoes keyword not found" });
    } else {
      // let result = findMaterialKeywords(textArray, uniqueShoes);
      let result = findMaterialKeywords(tagP, uniqueShoes);
      if (isEmptyObject(result)) {
        res.status(200).send({
          error:
            "Shoes material not found, listed material: leather, canvas, textiles, rubber, synthetic, foam, denim suede",
        });
      } else {
        res
          .status(200)
          .send({ items: findMaterialSizes(sortedShoes, result.material) });
      }
    }
    //res.status(200).send({ error: "Timeout" });
    // console.log(result);
    // console.log(findMaterialSizes(sortedShoes, result.material));
    // res.status(200).send(sortedShoes);
  } catch (error) {
    // console.log(error);
    res.status(500).send(error);
  }
});

app.post("/api/v1/getProductHTML", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).send("Bad request: 'url' param is missing!");
    return;
  }

  try {
    const html = await getPageHTML(url);
    res.status(200).send(html);
  } catch (error) {
    // console.log(error);
    res.status(500).send(error);
  }
});

app.listen(port, () => console.log(`Server started on port: ${port}`));
