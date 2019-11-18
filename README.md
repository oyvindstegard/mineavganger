# mine avganger - personlig avgangstavle som en webapp

*For English readers: this README is written in Norwegian, since the webapp
primarily is intended for a Norwegian audience. However, all the code is written
in English.*

Eksperiment/eksempel/demo på bruk av Entur.org JourneyPlanner API for å lage min
egen personlige avgangstavle for kollektivreiser i Norge. I form av en enkel og
tilstandsløs webapplikasjon. All kode er JavaScript/HTML og applikasjonen
trenger ingen backend annet enn Enturs åpent tilgjengelige API-er.

![Screenshot](https://stegard.net/dl/avgangsliste.png)

## Motivasjon

1. Ruter.no fjernet mulighet for å lagre favoritt-avganger på nettsidene sine.
   Jeg pendler og trenger stadig oppdatert informasjon om de samme avgangene,
   hver dag.
  
2. Rask tilgang til sanntidsinformasjon når jeg er på farten, og bare for
   avgangene jeg bruker, i en kompakt form, uten at jeg må installere en
   mobilapp for *det også*.

3. Utforske Entur.org sitt JourneyPlanner API og GraphQL.


## Eksempel/demo kjører på

https://stegard.net/mineavganger/

## Bruk

1. Kopier filene til en web-server/hosting-løsning.

2. Ferdig; du har nå appen på ditt eget nettsted.

Alternativt serves også appen <a
href="https://stegard.net/mineavganger/">herfra</a>, men kun for demo-formål.

## Avhengigheter

1. Entur.org åpent JourneyPlanner API: https://api.entur.io/journey-planner/v2/graphql

2. Entur.org åpent Geocoder API: https://api.entur.io/geocoder/v1/autocomplete

3. JQuery og jQuery.autocomplete (inkludert)

4. Et sted å serve web-ressursene fra.

5. En nettleser/mobil.

## Utvikling

Dersom du synes applikasjonen er nyttig må du gjerne fortelle om det. Og du kan
selvfølgelig rapportere om feil/mangler her, eller lage en pull-request som
løser problemet. 
