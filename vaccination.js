var $grid = '';
// get files from OWID github repository
var file_update_time = "https://raw.githubusercontent.com/owid/COVID-19-data/master/public/data/owid-covid-data-last-updated-timestamp.txt";
var file_vaccinations = "https://raw.githubusercontent.com/owid/COVID-19-data/master/public/data/vaccinations/vaccinations.csv";
var file_locations = "https://raw.githubusercontent.com/owid/COVID-19-data/master/public/data/vaccinations/locations.csv";
var file_population = "https://raw.githubusercontent.com/owid/COVID-19-data/master/scripts/input/un/population_2020.csv";

// get files from my github repository
var file_vaccine_group = "vaccine_groups.csv";
//var file_population = "population.csv";

// define color variables 
var clrBlue = 'rgba(49,130,189,.9)';
var clrRed = 'rgba(255,0,0,.9)';
var clrGray = 'rgba(204,204,204,.9)';
var clrBlack = 'rgba(0,0,0,.9)';
var clrWhiteTransparent = 'rgba(255,255,255,0)';

// define country filter variable
var selCountry = "Canada";
localStorage.setItem("storeCountry", selCountry);

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
    lastUpdated = changeTimezone(updateTime);
    document.getElementById('last_update').innerHTML += ' <small class="text-muted">Data updated: ' + lastUpdated + '</small>';

    // exclude dupe locations from vaccinations array
    const arrVacDetail = arrVaccinations.filter(function(d) { 
        return d.location != "England" && d.location != "European Union" && d.location != "Gibraltar" && d.location != "Northern Ireland" && d.location != "Scotland" && d.location != "Wales" && d.location != "World";
    });

    // add  daily vaccinations per 100 column & reformatted date for sorting
    arrVacDetail.forEach(function(d) {
        d.daily_vaccinations_per_hundred = (d.daily_vaccinations_per_million / 10000).toFixed(3);
        d.date_sort = reformatDate(d.date);
        d.concatLocDate = d.location + d.date;
        d.source = "owid";
    });

    // sort arrVacDetail array by location asc & date desc just in case it is not already
    arrVacDetail.sort((a, b) => a.location.localeCompare(b.location) || a.date_sort - b.date_sort);

    // extract total vaccinations & per 100 into new array to fill forward values
    var arrVacPer100 = arrVacDetail.map(function(i){return i.total_vaccinations_per_hundred;});
    var arrTotalVaccinations = arrVacDetail.map(function(i){return i.total_vaccinations;});
    function getFilledUpArray(array) {
        let lastDefinedElement;
        return array.map(element => {
            if (element === "") {
                element = lastDefinedElement;
            }
            lastDefinedElement = element;
            return element;
        });
    }

    // fill forward total vaccinations & per 100 arrays
    arrVacPer100Filled = getFilledUpArray(arrVacPer100);
    arrTotalVaccinationsFilled = getFilledUpArray(arrTotalVaccinations);

    // write fill forward total vaccinations & per 100 arrays back to arrVacDetail
    var i = 0;
    arrVacDetail.forEach(function(d) {
        d.total_vaccinations_per_hundred_filled = arrVacPer100Filled[i];
        d.total_vaccinations_filled = arrTotalVaccinationsFilled[i];
        i++;
    });

    // create owid_vaccine_alt, vaccine_group columns in arrLocations
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
        ({concatLocDate, location, iso_code, date, date_sort, total_vaccinations, total_vaccinations_filled, people_vaccinated, people_fully_vaccinated, daily_vaccinations_raw, daily_vaccinations, total_vaccinations_per_hundred, total_vaccinations_per_hundred_filled, people_vaccinated_per_hundred, people_fully_vaccinated_per_hundred, daily_vaccinations_per_million, daily_vaccinations_per_hundred, source}, {vaccines, last_observation_date, owid_vaccine_alt, vaccine_group, population}, ) => 
        ({concatLocDate, location, iso_code, date, date_sort, total_vaccinations, total_vaccinations_filled, people_vaccinated, people_fully_vaccinated, daily_vaccinations_raw, daily_vaccinations, total_vaccinations_per_hundred, total_vaccinations_per_hundred_filled, people_vaccinated_per_hundred, people_fully_vaccinated_per_hundred, daily_vaccinations_per_million, daily_vaccinations_per_hundred, vaccines, last_observation_date, owid_vaccine_alt, vaccine_group, population, source}), 
        {population: null});

    // filter vaccinations dataset by location max date to get current records only
    const arrVacDetailLocCurrent = arrVacDetailLoc.filter(function(d) {
        return d.date == d.last_observation_date;
    });

    // default group 
    var selVaccineGroup = "all";

    // filter arrVacDetailLocCurrent by vaccine group
    if (selVaccineGroup == 'all') {
        var arrVacDetailLocCurrentGroup = arrVacDetailLocCurrent;
    } else {
        var arrVacDetailLocCurrentGroup = arrVacDetailLocCurrent.filter(function(d) { 
            return d.vaccine_group.toLowerCase() === selVaccineGroup;
        });
    }

    // order vaccinationMaxDate desc by total_vaccinations_per_hundred
    arrVacDetailLocCurrentGroup.sort((a, b) => {
        return b.total_vaccinations_per_hundred_filled - a.total_vaccinations_per_hundred_filled;
    });

    // create country count
    var countryCount = arrVacDetailLocCurrentGroup.length;

    // CREATE CHART
    function createGlobalRankChart() {

        // create divs, para for chart
        var divTitle = document.createElement("h4");
        var divDesc= document.createElement("p");
        var divChart = document.createElement("div");
        divChart.id = 'div_chart';
        var chartTitle = 'COVID-19 Vaccine Doses Administered per 100 People - Rank By Country';
        var chartDesc = 'Shows vaccine doses administered per 100 people for all ' + countryCount + ' countries currently in OWID dataset.';
        divTitle.innerHTML = chartTitle;
        divDesc.innerHTML = chartDesc;
        document.getElementById('div_current_rank').append(divTitle);
        document.getElementById('div_current_rank').append(divDesc);
        document.getElementById('div_current_rank').append(divChart);
 
        // define x and y axis arrays
        var x = [];
        var yPer100 = [];
 
        // create axes x and y arrays
        for (var i=0; i<arrVacDetailLocCurrentGroup.length; i++) {
            var row = arrVacDetailLocCurrentGroup[i];
            x.push(row['location']);
            yPer100.push(row['total_vaccinations_per_hundred_filled']);
        }

        // create chart trace
        var trPer100 = {
            name: 'Doses Per 100',
            hoverlabel: {
                namelength :-1
            },
            x: x,
            y: yPer100,
            showgrid: false,
            fill: 'tozeroy',
            type: 'bar',
            marker:{
                color: clrGray,
            },
        };

        // create chart layout
        var layout = {
            title: {
                text: '',
                font: {
                    size: 14
                },
            },
            autosize: true,
            autoscale: false,
            margin: {
                l: 40,
                r: 40,
                b: 120,
                t: 40,
                pad: 2
            },
            xaxis: { 
                tickfont: {
                    size: 9
                },
                showgrid: false,
                tickmode: 'linear',
            },
            yaxis: { 
                tickfont: {
                    size: 11
                },
                showgrid: false
            }
        }

        // create plotly data, config, chart
        var data = [trPer100];
        var config = {responsive: true}
        Plotly.newPlot('div_chart', data, layout, config);

    }

    // CREATE CHART
   function createAllCountryRankSubPlots() {

        // create arrVacDates array with unique dates to loop through 
        var arrVacDates = [...new Set(arrVacDetailLoc.map(item => item.date))];

        // create max and min dates
        var minVacDate = d3.min(arrVacDates.map(d=>d));
        var maxVacDate = d3.max(arrVacDates.map(d=>d));

        // sort arrVacDates array desc order on date modified to integer
        // to loop through them desc below
        arrVacDates.sort(function(a,b) {
            a = a.split('-').join('');
            b = b.split('-').join('');
            //return a > b ? 1 : a < b ? -1 : 0; // asc
            return a < b ? 1 : a > b ? -1 : 0; // desc
        });

        //  define country rank array
        var arrCountryRank = [];

        // create arrCountryRank
        // loop through arrVacDates desc, get max date per country, that is less than loop date
        // assign that max date as country's last report date 
        for (var i=0; i<arrVacDates.length; i++) {

            var loopDate = arrVacDates[i];

            // filter arrVacDetailLoc to dates less than loop date
            var arrVacLoopDate = arrVacDetailLoc.filter(function(d) { 
                return d.date <= loopDate;
            });

            // summarize location by country's last report date
            var arrVacLoopDateMax = d3.nest()
            .key(function(d) { 
                return d.location; 
            })
            .rollup(function(v) { 
                return {
                    max_loop_date: d3.max(v, function(d) { return d.date; }),
                    max_loop_date_sort: d3.max(v, function(d) { return d.date_sort; })
                };
            })
            .entries(arrVacLoopDate)
            .map(function(group) {
                return {
                    location: group.key,
                    max_loop_date: group.value.max_loop_date,
                    max_loop_date_sort: group.value.max_loop_date_sort
                }
            });

            // create arrVacLoopDateMax concat location and date to join arrays
            arrVacLoopDateMax.forEach(function(d) {
                d.concatLocDate = d.location + d.max_loop_date;
            });

            // join arrVacLoopDateMax to arrVacLoopDate to get all data back
            const arrVacLoopDateMaxFull = equijoinWithDefault(
                arrVacLoopDateMax, arrVacLoopDate, 
                "concatLocDate", "concatLocDate", 
                ({max_loop_date}, {concatLocDate, daily_vaccinations, daily_vaccinations_per_hundred, daily_vaccinations_per_million, daily_vaccinations_raw, date, date_sort, iso_code, last_observation_date, location, owid_vaccine_alt, people_fully_vaccinated, people_fully_vaccinated_per_hundred, people_vaccinated, people_vaccinated_per_hundred, population, source, total_vaccinations, total_vaccinations_filled, total_vaccinations_per_hundred, total_vaccinations_per_hundred_filled, vaccine_group, vaccines}, ) => 
                ({max_loop_date, concatLocDate, daily_vaccinations, daily_vaccinations_per_hundred, daily_vaccinations_per_million, daily_vaccinations_raw, date, date_sort, iso_code, last_observation_date, location, owid_vaccine_alt, people_fully_vaccinated, people_fully_vaccinated_per_hundred, people_vaccinated, people_vaccinated_per_hundred, population, source, total_vaccinations, total_vaccinations_filled, total_vaccinations_per_hundred, total_vaccinations_per_hundred_filled, vaccine_group, vaccines}), 
                {population: null});
            
            // order arrVacLoopDateMaxFull desc by total_vaccinations_per_hundred to get rank
            arrVacLoopDateMaxFull.sort((a, b) => {
                return b.total_vaccinations_per_hundred_filled - a.total_vaccinations_per_hundred_filled;
            });

            // define loop country count
            vCountryCount = arrVacLoopDateMaxFull.length;
            
            // create arrCountryRank
            for (var j=0; j < arrVacLoopDateMaxFull.length; j++) {
                row = arrVacLoopDateMaxFull[j];
                // push elements to arrCountryRank
                arrCountryRank.push({
                    date: loopDate, 
                    date_sort: row.max_loop_date_sort, 
                    location: row.location,  
                    total_vaccinations: parseInt(row.total_vaccinations_filled).toLocaleString(),
                    total_vaccinations_per100: parseFloat(row.total_vaccinations_per_hundred_filled).toFixed(2), 
                    rank: (parseInt(j) + 1),
                    rank_percentile: getRankPctile((parseInt(j) + 1), vCountryCount)
                });
            }
        }

        // create divs, para for section
        var divTitle = document.createElement("h4");
        var divDesc= document.createElement("p");
        var divChart = document.createElement("div");
        var divButtons = document.createElement("div");
        divChart.id = 'div_subplots';
        divChart.className = 'grid';
        var chartTitle = 'COVID-19 Vaccine Doses Administered per 100 People - Rank Percentile By Country';
        var chartDesc = 'Visualizations show vaccine dose administration per 100 people as a rank percentile (blue line) for all countries in OWID dataset. Includes trendline (red dashed line).';

        var chartButtons = 
        '<span><strong>Sort:</strong> </span><div class="btn-group flex-wrap" role="group" aria-label="Basic example">' +
        '<button type="button" class="btn btn-light sort-btn" value="asc" data-sort-by="location">Country</button>' +
        '<button type="button" class="btn btn-light sort-btn" value="asc" data-sort-by="rank">Rank</button>' +
        '<button type="button" class="btn btn-light sort-btn" value="asc" data-sort-by="slope">Change</button>' +
        '<button type="button" class="btn btn-light sort-btn" value="asc" data-sort-by="min_date">Date</button>' +
        '<button type="button" class="btn btn-light sort-btn" value="asc" data-sort-by="total_vaccinations">Doses</button>' +
        '<button type="button" class="btn btn-light sort-btn" value="asc" data-sort-by="population">Population</button>' +
        '</div>';

        divTitle.innerHTML = chartTitle;
        divDesc.innerHTML = chartDesc;
        divButtons.innerHTML = chartButtons;
        document.getElementById('div_country_rank').append(divTitle);
        document.getElementById('div_country_rank').append(divDesc);
        document.getElementById('div_country_rank').append(divButtons);
        document.getElementById('div_country_rank').append(divChart);

        // create unique location array to loop through
        var arrRanklocations = [...new Set(arrCountryRank.map(item => item.location))];
        arrRanklocations.sort((a, b) => a.localeCompare(b));

        // loop to create each location chart
        for (var i=0; i < arrRanklocations.length; i++) {

            var xDate = [];
            var xDateSort = [];
            var xDateDays = [];
            var yRankPctile = [];

            // filter to current loop country
            var locationData = arrCountryRank.filter(function(d) { 
                return d.location === arrRanklocations[i];
            });

            var currentRank = arrVacDetailLocCurrent.findIndex(x => x.location === arrRanklocations[i]) + 1;
            var currentTotalVax = arrVacDetailLocCurrent.find(x => x.location === arrRanklocations[i]).total_vaccinations_filled;
            var currentPer100 = arrVacDetailLocCurrent.find(x => x.location === arrRanklocations[i]).total_vaccinations_per_hundred_filled;
            var locPopulation = arrVacDetailLocCurrent.find(x => x.location === arrRanklocations[i]).population;
            var locVaccines = arrVacDetailLocCurrent.find(x => x.location === arrRanklocations[i]).vaccines;
            
            // create location chart  x y arrays
            for (var j=0; j < locationData.length; j++) {
                xDate.push(locationData[j].date);
                xDateSort.push(parseInt(locationData[j].date_sort));
                xDateDays.push(dateDiffInDays(new Date("2020-12-13"), new Date(locationData[j].date)));
                yRankPctile.push(locationData[j].rank_percentile);
            }

            var xDateMin = d3.min(xDate.map(d=>d));
            var xDateDaysMin = d3.min(xDateDays.map(d=>d));
            var xDateDaysMax = d3.max(xDateDays.map(d=>d));
            var lr = linearRegression(yRankPctile, xDateDays);
            
            var trRankPctile = {
                name: '',
                hoverlabel: {
                    namelength :-1
                },
                yaxis: 'y',
                x: xDate,
                y: yRankPctile,
                //type: 'line',
                mode: 'lines',
                line: {
                    dash: 'solid',
                    width: 2
                },
                marker:{
                    color: clrBlue
                },
            };

            var trTrendline = {
                name: '',
                hoverinfo:'skip',
                yaxis: 'y',
                x: [getDiffDate(xDateDaysMin), getDiffDate(xDateDaysMax)],
                y: [xDateDaysMin * lr.slope + lr.intercept, xDateDaysMax * lr.slope + lr.intercept],
                type: 'scatter',
                mode: 'lines',
                line: {
                    dash: 'dot',
                    width: 2
                },
                marker:{
                    color: clrRed
                }
            };

            // create chart layout
            var layout = {
                title: {
                    text: '<span style="font-weight: bold;">' + arrRanklocations[i] + '</span>',
                    font: {
                        size: 14
                    },
                },
                autosize: true,
                autoscale: false,
                width: 200,
                height: 175,
                margin: {
                    l: 20,
                    r: 10,
                    b: 25,
                    t: 50
                },
                showlegend: false,
                xaxis: { 
                    //type: 'category',
                    tickfont: {
                        size: 9
                    },
                    showgrid: false,
                    range: [minVacDate, maxVacDate],
                },
                yaxis: { 
                    title: {
                        text: '',
                    },
                    tickfont: {
                        size: 9
                    },
                    range: [0, 100],
                    showgrid: false
                }
            }

            // create location div elements
            var div_location = document.createElement("div");
            var div_span_location = document.createElement("span");
            var div_span_rank = document.createElement("span");
            var div_span_slope = document.createElement("span");
            var div_span_min_date = document.createElement("span");
            var div_span_total_vaccinations = document.createElement("span");
            var div_span_population = document.createElement("span");

            // create element id and classnames
            div_location.id = 'locationDiv' + i;
            div_location.className = 'location_div';
            div_span_location.className = 'location';
            div_span_rank.className = 'rank';
            div_span_slope.className = 'slope';
            div_span_min_date.className = 'min_date';
            div_span_total_vaccinations.className = 'total_vaccinations';
            div_span_population.className = 'population';

            // append location div to the parent div_subplots (isotope 'grid')
            document.getElementById('div_subplots').append(div_location);

            // add hidden spans to location div for isotope
            div_location.innerHTML += '<span class="location span_hide" >'+ arrRanklocations[i] +'</span>';
            div_location.innerHTML += '<span class="rank span_hide">'+ currentRank + '</span>';
            div_location.innerHTML += '<span class="min_date span_hide">' + xDateDaysMin + '</span>';
            div_location.innerHTML += '<span class="slope span_hide">'+ lr.slope + '</span>';
            div_location.innerHTML += '<span class="total_vaccinations span_hide">' + currentTotalVax + '</span>';
            div_location.innerHTML += '<span class="population span_hide">' + locPopulation + '</span>';

            // add visible content below chart in location div
            div_location.innerHTML += '<p class="span_show">Current Rank: ' + currentRank + ' <br>Start: '+ xDateMin + '<br>Doses: ' + parseInt(currentTotalVax).toLocaleString() + '<br>Doses per 100: '+ parseFloat(currentPer100).toFixed(2) + '<br>Pop: ' + parseInt(locPopulation).toLocaleString() + '<br>' + locVaccines + '</p>';

            // create plotly data, config, chart
            var data = [trRankPctile, trTrendline];
            var config = {responsive: true}
            Plotly.newPlot('locationDiv' + i, data, layout, config);

        }
        
    }

    // create charts when page loads
    createGlobalRankChart();
    createAllCountryRankSubPlots();

    // initiate isotope
    var $grid = $('.grid').isotope({
        itemSelector: '.location_div',  
        layoutMode: 'fitRows',
        getSortData: {
            location: '.location',
            rank: '.rank parseInt',
            slope: '.slope parseFloat',
            min_date: '.min_date parseInt',
            total_vaccinations: '.total_vaccinations parseInt',
            population: '.population parseInt'
        }
    });

    // isotope button clicks
    $('.sort-btn').on( 'click', function() {
        var sortByValue = $(this).attr('data-sort-by');
        if ($(this).val() == "asc") {
            $(this).val("desc");
            varSortOrder = true;
        } else {
            $(this).val("asc");
            varSortOrder = false;
        }
        $grid.isotope({ 
            sortBy: sortByValue,
            sortAscending: varSortOrder
        });
    });

});

// FUNCTIONS



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
        new_name = vaccine
    } else {
        new_name = x.owid_vaccine_alt
    } 
    return new_name
}

// lookup to return alternate vaccine group
function getVaccineGroup(vaccine, arrVaccineGroup) {
    var x = arrVaccineGroup.find(x => x.owid_vaccine === vaccine);
    if (typeof x === 'undefined'){
        new_name = 'unknown'
    } else {
        new_name = x.vaccine_group
    } 
    return new_name
}

// assign bar color based on x value
function fillColor(x, location) {
    colors = [];
    for (var i=0; i<x.length; i++) {
        if (x[i] == selCountry) {
            colors.push(clrBlue);
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