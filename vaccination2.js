
// get files from OWID github repository
var file_update_time = "https://raw.githubusercontent.com/owid/COVID-19-data/master/public/data/owid-covid-data-last-updated-timestamp.txt";
var file_vaccinations = "https://raw.githubusercontent.com/owid/COVID-19-data/master/public/data/vaccinations/vaccinations.csv";
var file_locations = "https://raw.githubusercontent.com/owid/COVID-19-data/master/public/data/vaccinations/locations.csv";
var file_population = "https://raw.githubusercontent.com/owid/COVID-19-data/master/scripts/input/un/population_2020.csv";

// to do: use stable url instead
// https://covid.ourworldindata.org/data/vaccinations/vaccinations.csv

// get files from my github repository
var file_vaccine_group = "vaccine_groups.csv";

// define color variables
const clrBlue = 'rgba(49,130,189,.5)';
const clrRed = 'rgba(215,25,28,.5)';
const clrPink = 'rgba(233,163,201,.5)'
const clrGreen = 'rgba(26,150,65, .5)';
const clrGray = 'rgba(204,204,204,.5)';
const clrBlack = 'rgba(0,0,0,.9)';
const clrWhiteTransparent = 'rgba(255,255,255,0)';

// define isotope grid
var $grid = '';

// define default filters
var fltrPopulation = 0;
var fltrVaccineGroup = '';

// get data (with filters, if any)
getData(fltrVaccineGroup, fltrPopulation);

function getData(fltrVaccineGroup, fltrPopulation){ 
 
    // promise data from sources
    Promise.all([
        d3.csv(file_vaccinations),
        d3.csv(file_locations),
        d3.csv(file_population),
        d3.csv(file_update_time),
        d3.csv(file_vaccine_group),
    ]).then(function(data) {

        // get data from promise
        var arrVaccinations = data[0];
        var arrLocations = data[1];
        var arrPopulation = data[2];
        var updateTime = data[3].columns[0];
        var arrVaccineGroup = data[4];

        // write owid last updated time to index page
        const lastUpdated = changeTimezone(updateTime);

        // exclude dupe locations from arrVaccinations
        const arrVacDetail = arrVaccinations.filter(function(d) { 
            return d.location != "England" && d.location != "European Union" && d.location != "Gibraltar" && d.location != "Northern Ireland" && d.location != "Scotland" && d.location != "Wales" && d.location != "World" && d.location != "Africa" && d.location != "Asia" && d.location != "Europe" && d.location != "North America" && d.location != "South America" && d.location != "Oceania";
        });

        // create new elements in arrVacDetail
        arrVacDetail.forEach(function(d) {
            d.daily_vaccinations_per_hundred = (d.daily_vaccinations_per_million / 10000).toFixed(3);
            d.date_sort = reformatDate(d.date);
            d.concatLocDate = d.location + d.date;
        });

        // sort arrVacDetail to ensure desired to prepare for fill up next step
        arrVacDetail.sort((a, b) => a.location.localeCompare(b.location) || a.date_sort - b.date_sort);

        // create new fill up arrays
        arrVacPer100Filled = fillUpArray(arrVacDetail.map(function(i){return i.total_vaccinations_per_hundred;}));
        arrTotalVaccinationsFilled = fillUpArray(arrVacDetail.map(function(i){return i.total_vaccinations;}));
        arrDailyVaccinationsFilled = fillUpArray(arrVacDetail.map(function(i){return i.daily_vaccinations_per_hundred;}));

        // write new fill up arrays back to arrVacDetail
        var i = 0;
        arrVacDetail.forEach(function(d) {
            d.total_vaccinations_per_hundred_filled = arrVacPer100Filled[i];
            d.total_vaccinations_filled = arrTotalVaccinationsFilled[i];
            d.daily_vaccinations_per_hundred_filled = arrDailyVaccinationsFilled[i];
            i++;
        });

        // create new elements in arrLocations
        arrLocations.forEach(function(d) {
            d.owid_vaccine_alt = getVaccineAlt(d.vaccines, arrVaccineGroup);
            d.vaccine_group = getVaccineGroup(d.vaccines, arrVaccineGroup);
        });

        // left join arrPopulation to arrLocations
        const arrLocationPop = equijoinWithDefault(
            arrLocations, arrPopulation, 
            "location", "entity", 
            ({location, vaccines, owid_vaccine_alt, vaccine_group, last_observation_date}, {population}, ) => 
            ({location, vaccines, owid_vaccine_alt, vaccine_group, last_observation_date, population}), 
            {population:null});

        // left join arrLocationPop to arrVacDetail
        const arrVacDetailLoc = equijoinWithDefault(
            arrVacDetail, arrLocationPop, 
            "location", "location", 
            ({concatLocDate, location, iso_code, date, date_sort, total_vaccinations, total_vaccinations_filled, people_vaccinated, people_fully_vaccinated, daily_vaccinations_raw, daily_vaccinations, total_vaccinations_per_hundred, total_vaccinations_per_hundred_filled, people_vaccinated_per_hundred, people_fully_vaccinated_per_hundred, daily_vaccinations_per_million, daily_vaccinations_per_hundred, daily_vaccinations_per_hundred_filled}, {vaccines, last_observation_date, owid_vaccine_alt, vaccine_group, population}, ) => 
            ({concatLocDate, location, iso_code, date, date_sort, total_vaccinations, total_vaccinations_filled, people_vaccinated, people_fully_vaccinated, daily_vaccinations_raw, daily_vaccinations, total_vaccinations_per_hundred, total_vaccinations_per_hundred_filled, people_vaccinated_per_hundred, people_fully_vaccinated_per_hundred, daily_vaccinations_per_million, daily_vaccinations_per_hundred, daily_vaccinations_per_hundred_filled, vaccines, last_observation_date, owid_vaccine_alt, vaccine_group, population}), 
            {population: null});

        // write prev (eg i-1 day) fill forward array values to arrVacDetail
        var i = 0;
        arrVacDetailLoc.forEach(function(d) {
            d.total_vaccinations_per_hundred_filled_prev = arrVacPer100Filled[i-1];
            d.total_vaccinations_filled_prev = arrTotalVaccinationsFilled[i-1];
            d.daily_vaccinations_per_hundred_filled_prev = arrDailyVaccinationsFilled[i-1];
            i++;
        });

        // create new element in arrVacDetailLoc
        arrVacDetailLoc.forEach(function(d) {
            if (d.date === d.last_observation_date) {d.current_date =  'current_date'} else { d.current_date = ''};
        });

        // filter arrVacDetailLocCurrent by vaccine group
        if (fltrVaccineGroup == '') {
            var arrVacDetailLocGroup = arrVacDetailLoc;
        } else {
            var arrVacDetailLocGroup = arrVacDetailLoc.filter(function(d) { 
                return d.vaccine_group.toLowerCase() === fltrVaccineGroup.toLowerCase() && d.population > fltrPopulation;
            });
        }

        // filter vaccinations dataset by location max date to get current records only
        const arrVacDetailLocGroupCurrent = arrVacDetailLocGroup.filter(function(d) {
            return d.current_date == 'current_date';
        });

        // order vaccinationMaxDate desc by total_vaccinations_per_hundred
        arrVacDetailLocGroupCurrent.sort((a, b) => {
            return b.total_vaccinations_per_hundred_filled - a.total_vaccinations_per_hundred_filled;
        });
        
        // create country count
        var countryCount = arrVacDetailLocGroupCurrent.length;

        console.log(countryCount);

    });
}



// FUNCTIONS

function checkChange() {
    var array = []
    var checkboxes = document.querySelectorAll('input[type=checkbox]:checked')

    for (var i = 0; i < checkboxes.length; i++) {
        array.push(checkboxes[i].value)
    }
}


function getDiffDate(days) {
    var date = new Date("2020-12-13");
    return date.setDate(date.getDate() + days)
}

// a and b are javascript Date objects
function dateDiffInDays(a, b) {
    const _MS_PER_DAY = 1000 * 60 * 60 * 24;
    // Discard the time and time-zone information.
    const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  
    return Math.floor((utc2 - utc1) / _MS_PER_DAY);
  }

// fill 'up' array - if value missing get prev values
    function fillUpArray(array) {
    let lastDefinedElement;
    return array.map(element => {
        if (element === "") {
            element = lastDefinedElement;
        }
        lastDefinedElement = element;
        return element;
    });
}

// create trendline
function linearRegression(y, x){
    var lr = {};
    var n = y.length;
    var sum_x = 0;
    var sum_y = 0;
    var sum_xy = 0;
    var sum_xx = 0;
    var sum_yy = 0;

    for (var i = 0; i < y.length; i++) {
        sum_x += parseInt(x[i]);
        sum_y += y[i];
        sum_xy += (parseInt(x[i]) * y[i]);
        sum_xx += (parseInt(x[i]) * parseInt(x[i]));
        sum_yy += (y[i] * y[i]);
    } 

    lr['slope'] = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    lr['intercept'] = (sum_y - lr.slope * sum_x)/n;
    lr['r2'] = Math.pow((n * sum_xy - sum_x * sum_y)/Math.sqrt((n * sum_xx - sum_x * sum_x) * (n * sum_yy - sum_y * sum_y)), 2);

    return lr;
};

// not used yet but hide show date, country table
function toggleTable(tableId) {
   if (document.getElementById(tableId).style.display == "table" ) {
       document.getElementById(tableId).style.display="none";
   } else {
      document.getElementById(tableId).style.display="table";
   }
}

// get rank percentile for single rank / country count
function getRankPctile(rank, ctryCount) {
    return parseInt((ctryCount - rank + 1) / ctryCount * 100);
}

// get rank percentile for array of ranks / country counts
function getPercentile(arrRank, arrCtryCount) {
    results = [];
    for (var i=0; i<arrRank.length; i++) {
        if (arrRank[i] > 0) {
            results.push(parseInt((arrCtryCount[i] - arrRank[i] + 1) / arrCtryCount[i] * 100));
        }
    }
    return results
}

// used to round up y axis range max value
function roundUp10(x) {
    return Math.ceil(x / 10) * 10;
}

// left join function used to join datasets
function equijoinWithDefault(xs, ys, primary, foreign, sel, def) {
    const iy = ys.reduce((iy, row) => iy.set(row[foreign], row), new Map);
    return xs.map(row => typeof iy.get(row[primary]) !== 'undefined' ? sel(row, iy.get(row[primary])): sel(row, def));
}

// remove date hyphens to create integer to sort with
function reformatDate(d) {
    // "2021-03-13" is owid date format 
    var newDate = d.replace(/-/g, '');
    return newDate
}

function changeTimezone(d) {
    var date = new Date(d);
    var dateEST = new Date(date.setHours(date.getHours() - 5));
    return new Date(dateEST.getTime() - (dateEST.getTimezoneOffset() * 60000)).toISOString().replace('T', ' ').slice(0, -8) + ' EST';
}

// lookup to return alternate vaccine name
function getVaccineAlt(vaccine, arrVaccineGroup) {
    var x = arrVaccineGroup.find(x => x.owid_vaccine === vaccine);
    if (typeof x === 'undefined'){
        newName = vaccine
    } else {
        newName = x.owid_vaccine_alt
    } 
    return newName
}

// lookup to return alternate vaccine group
function getVaccineGroup(vaccine, arrVaccineGroup) {
    var x = arrVaccineGroup.find(x => x.owid_vaccine === vaccine);
    if (typeof x === 'undefined'){
        newName = 'unknown'
    } else {
        newName = x.vaccine_group
    } 
    return newName
}

// assign bar color based on current and prev per 100 values
function fillColor(yper100, yper100Prev) {
    colors = [];
    for (var i = 0; i < yper100.length; i++) {
        if (yper100[i] > yper100Prev[i]) {
            colors.push(clrGreen);
        } else if (yper100[i] < yper100Prev[i]) {
            colors.push(clrRed);
        } else {
            colors.push(clrGray);
        }
    }
    return colors
}

// hide show additional notes hidden div by clicking  read more link
function hideShowDiv(id) {
   var e = document.getElementById(id);
   if(e.style.display == 'block')
      e.style.display = 'none';
   else
      e.style.display = 'block';
}

