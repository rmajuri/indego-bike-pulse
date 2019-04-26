$(document).ready(function() {
  let markers = []
  let infoWindows = {}
  let stationData

  //handle weather data
  $.getJSON(`/weather-api`, function(res) {
    //res.main contains current temp, humidity, temp_min, and temp_max
    const dataResponse = res.main

    const temperatureData = parseInt(dataResponse.temp, 10)
    const weatherDescriptionData = res.weather[0].description
    const windSpeedData = parseInt(res.wind.windSpeed, 10)

    //Determine whether app shows weather warning. Appears just below header. Dangerous condition
    //determined by extreme cold/heat or high winds
    function determineWeatherWarning(temperature, wind) {
      let warningMessage
      let weatherWarning = $('#weatherWarning')

      if (temperature > 98) {
        warningMessage = 'Warning: temperatures exceeding 98°F! Stay cool!'
      } else if (temperature < 32) {
        warningMessage = 'Warning: temperatures below 32°F! Roads may be icy!'
      } else if (wind > 35) {
        warningMessage = 'Warning: wind speeds exceeding 35 mph!'
      }

      if (warningMessage) {
        weatherWarning.text(warningMessage)
      }
    }

    //Display weather info in header.
    function setWeatherInfo(temperature, description) {
      const $temperatureComponent = $('#degreesFahrenheit')
      const $weatherDescriptionComponent = $('#weatherDescription')
      $temperatureComponent.text(temperature)
      $weatherDescriptionComponent.text(description)
    }

    determineWeatherWarning(temperatureData, windSpeedData)
    setWeatherInfo(temperatureData, weatherDescriptionData)

    console.log(res)
  })

  $.getJSON(`/indego-api`, function(res) {
    stationData = res
    console.log('ORIGINAL STATION DATA', stationData)
  })

  //take in user's location coords and finds the distance between user and all stations. Stores this distance
  //in a copy of station object that now includes distanceFromUserAddress property
  //input location coords will be results[0].geometry.location.lat() and results[0].geometry.location.lng()
  function getStationsWithDistanceFromInput(userInputCoords, stations) {
    const stationsWithDistanceFromAddress = stations.map(function(station) {
      const stationCopy = Object.assign({}, station)
      const distance = Math.sqrt(
        Math.pow(userInputCoords[0] - station.properties.latitude, 2) +
          Math.pow(userInputCoords[1] - station.properties.longitude, 2)
      )
      stationCopy.properties.distanceFromUserAddress = distance
      return stationCopy
    })

    return stationsWithDistanceFromAddress
  }

  //sort the station objects by the distanceFromUserAddress property
  function sortDistancesAscending(stations) {
    return stations.sort(function(a, b) {
      return (
        a.properties.distanceFromUserAddress -
        b.properties.distanceFromUserAddress
      )
    })
  }

  //create the bike station markers that will be placed on the map
  function getDataForMarkers(closestStations) {
    for (let i = 0; i < closestStations.length; i++) {
      let marker = new google.maps.Marker({
        position: new google.maps.LatLng(
          closestStations[i].properties.latitude,
          closestStations[i].properties.longitude
        ),
        map: map,
      })

      infoWindows[`infoWindow${i}`] = new google.maps.InfoWindow({
        content: createInfoWindowContentString(closestStations[i]),
      })

      marker.addListener('click', function() {
        infoWindows[`infoWindow${i}`].open(map, marker)
      })

      markers.push(marker)
    }
  }

  //Info window for bike station marker
  function createInfoWindowContentString(station) {
    let contentString =
      `<div id='infoWindowContent'>` +
      `<h1 id='stationAddress'>${station.properties.name}</h1>` +
      `<h4 id='stationLocationName'>${station.properties.addressStreet}</h4>` +
      `<div id='infoWindowBody'>` +
      `<p class='infoBodyDetail'><span class='boldInfoBodyDetail'>Bikes available:</span><span class='lightInfoBodyDetail'>${
        station.properties.bikesAvailable
      }</span></p>` +
      `<p class='infoBodyDetail'><span class='boldInfoBodyDetail'>Parking Docks Available:</span><span class='lightInfoBodyDetail'>${
        station.properties.docksAvailable
      }</span></p>` +
      `</div>` +
      `</div>`
    return contentString
  }

  //create beach flag marker for user's location
  function createUserLocationMarker(userInputCoords, userLocationInfo) {
    const image = {
      url:
        'https://developers.google.com/maps/documentation/javascript/examples/full/images/beachflag.png',
      size: new google.maps.Size(20, 32),
      origin: new google.maps.Point(0, 0),
      anchor: new google.maps.Point(0, 32),
    }
    const shape = {
      coords: [1, 1, 1, 20, 18, 20, 18, 1],
      type: 'poly',
    }
    const userLocationMarker = new google.maps.Marker({
      position: new google.maps.LatLng(userInputCoords[0], userInputCoords[1]),
      map: map,
      icon: image,
      shape: shape,
      zIndex: 10,
    })

    infoWindows.userInfoWindow = new google.maps.InfoWindow({
      content: createUserLocationInfoWindowContentString(userLocationInfo),
    })

    userLocationMarker.addListener('click', function() {
      infoWindows.userInfoWindow.open(map, userLocationMarker)
    })

    markers.push(userLocationMarker)
  }

  //info window for user location marker
  function createUserLocationInfoWindowContentString(userLocationInfo) {
    let contentString =
      `<div id='infoWindowContent'>` +
      `<h3 id='stationAddress'>You are here.</h3>` +
      `<h4 id='stationLocationName'>${userLocationInfo.name}</h4>` +
      `</div>`
    return contentString
  }

  function placeMarkersOnMap(phillyMap) {
    for (let i = 0; i < markers.length; i++) {
      markers[i].setMap(phillyMap)
    }
  }

  function clearMarkers() {
    placeMarkersOnMap(null)
  }

  function deleteMarkers() {
    clearMarkers()
    markers = []
    infoWindows = {}
  }

  function updateMap(event) {
    event.preventDefault()

    deleteMarkers()

    const request = {
      query: event.target.firstElementChild.value,
      fields: ['name', 'geometry'],
      locationBias: circle.getBounds(),
    }

    service.findPlaceFromQuery(request, function(results, status) {
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        const inputAddressCoords = [
          results[0].geometry.location.lat(),
          results[0].geometry.location.lng(),
        ]
        const withDistances = getStationsWithDistanceFromInput(
          inputAddressCoords,
          stationData
        )
        const sortedAscending = sortDistancesAscending(withDistances)
        console.log('TRANSFORMED STATION DATA', sortedAscending)
        console.log(results)
        //Takes first four stations from array of ascending distance-from-user values.
        const closestFour = sortedAscending.slice(0, 4)
        createMapInfoColumn(closestFour)
        createUserLocationMarker(inputAddressCoords, results[0])
        getDataForMarkers(closestFour)
        placeMarkersOnMap(map)
        map.setCenter(results[0].geometry.location)
      }
    })
  }

  function createMapInfoColumn(stations) {
    for (let i = 0; i < stations.length; i++) {
      createStationInfoBlock(stations[i], i)
    }
  }

  function createStationInfoBlock(station, stationNum) {
    const stationInfoBlock = `<div class='stationInfoBlock block${stationNum}'>
      <h3>${station.properties.name}</h3>
      <h6>${station.properties.addressStreet}</h6>
      <h5><span>Bikes available:</span>${station.properties.bikesAvailable}</h5>
      <h5><span>Parking docks available:</span>${station.properties.docksAvailable}</h5>
      <h5 class='inactive extraInfo${stationNum}'><span>Classic bikes available:</span>${station.properties.classicBikesAvailable}</h5>
      <h5 class='inactive extraInfo${stationNum}'><span>Smart bikes available:</span>${station.properties.smartBikesAvailable}</h5>
      <h5 class='inactive extraInfo${stationNum}'><span>Electric bikes available:</span>${station.properties.electricBikesAvailable}</h5>
      <h5 class='inactive extraInfo${stationNum}'><span>Trikes available:</span>${station.properties.trikesAvailable}</h5>
      <p class='expandInfo${stationNum}'>See More</p>
    </div>`
    $('#mapInfoColumn').append(stationInfoBlock)
    $(document).on('click', `.expandInfo${stationNum}`, function() {
      const num = stationNum
      handleExpansionButtonClick(num)
    })
  }

  function handleExpansionButtonClick(stationNum) {
    console.log('hey')
    if ($(`.extraInfo${stationNum}`).hasClass('inactive')) {
      $(`.extraInfo${stationNum}`).removeClass('inactive')
      $(`.expandInfo${stationNum}`).text('See Less')
    } else {
      $(`.extraInfo${stationNum}`).addClass('inactive')
      $(`.expandInfo${stationNum}`).text('See More')
    }
  }


  const $inputForm = $('#inputForm')
  //Update map takes in user input and changes map based on the lat/long coordinates of user location.
  $inputForm.on('submit', updateMap)
})
