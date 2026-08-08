"use client";

import { useId, useMemo, useState } from "react";
import { City, Country, State } from "country-state-city";
import styles from "./product-purchase.module.css";

export function LocationFields() {
  const id = useId();
  const countries = useMemo(() => Country.getAllCountries(), []);
  const defaultCountry = countries.find((country) => country.isoCode === "GH");
  const [countryCode, setCountryCode] = useState(defaultCountry?.isoCode ?? "");
  const [countryName, setCountryName] = useState(defaultCountry?.name ?? "");
  const [stateCode, setStateCode] = useState("");
  const [stateName, setStateName] = useState("");
  const [cityName, setCityName] = useState("");

  const states = useMemo(
    () => (countryCode ? State.getStatesOfCountry(countryCode) : []),
    [countryCode],
  );
  const cities = useMemo(
    () =>
      countryCode && stateCode
        ? City.getCitiesOfState(countryCode, stateCode)
        : [],
    [countryCode, stateCode],
  );

  function chooseCountry(name: string) {
    setCountryName(name);
    const match = countries.find(
      (country) =>
        country.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    setCountryCode(match?.isoCode ?? "");
    setStateCode("");
    setStateName("");
    setCityName("");
  }

  function chooseState(name: string) {
    setStateName(name);
    const match = states.find(
      (state) => state.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    setStateCode(match?.isoCode ?? "");
    setCityName("");
  }

  return (
    <div className={styles.locationFields}>
      <label className={styles.field}>
        <span className={styles.label}>Country</span>
        <input
          type="search"
          aria-label="Country"
          value={countryName}
          list={`${id}-countries`}
          autoComplete="country-name"
          placeholder="Search countries"
          onChange={(event) => chooseCountry(event.target.value)}
          required
        />
        <input type="hidden" name="country_code" value={countryCode} />
        <datalist id={`${id}-countries`}>
          {countries.map((country) => (
            <option key={country.isoCode} value={country.name} />
          ))}
        </datalist>
        <span className={styles.hint}>Start typing to search</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Region / state</span>
        <input
          type="search"
          aria-label="Region / state"
          value={stateName}
          list={`${id}-states`}
          autoComplete="address-level1"
          placeholder={
            countryCode ? "Search regions" : "Choose a country first"
          }
          onChange={(event) => chooseState(event.target.value)}
          disabled={!countryCode || states.length === 0}
          required={states.length > 0}
        />
        <input type="hidden" name="region" value={stateName} />
        <datalist id={`${id}-states`}>
          {states.map((state) => (
            <option key={state.isoCode} value={state.name} />
          ))}
        </datalist>
        <span className={styles.hint}>
          {states.length ? "Filtered by country" : "No regions listed"}
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>City</span>
        <input
          type="search"
          aria-label="City"
          name="city"
          value={cityName}
          list={`${id}-cities`}
          autoComplete="address-level2"
          placeholder={stateCode ? "Search cities" : "Choose a region first"}
          onChange={(event) => setCityName(event.target.value)}
          disabled={!stateCode || cities.length === 0}
          required
        />
        <datalist id={`${id}-cities`}>
          {cities.map((city) => (
            <option
              key={`${city.name}-${city.latitude}-${city.longitude}`}
              value={city.name}
            />
          ))}
        </datalist>
        <span className={styles.hint}>
          {cities.length ? "Filtered by region" : "Select a region to continue"}
        </span>
      </label>
    </div>
  );
}
