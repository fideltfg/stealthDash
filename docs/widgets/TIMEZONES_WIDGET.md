# Timezones (Not Currently Available)

**Status**: This widget is not currently functional or available in the dashboard.

## Note

The `timezones.ts` file exists in the codebase but only contains timezone data (a list of IANA timezone identifiers). It does not have a widget renderer implementation and is not registered in the widget loader.

This file may be used as a data source by other widgets (like the Clock widget for timezone selection), but it is not a standalone widget that can be added to your dashboard.

## Available IANA Timezones Data

The file contains a comprehensive list of timezone identifiers from the IANA timezone database, including timezones for:
- Africa
- Americas  
- Antarctica
- Arctic
- Asia
- Atlantic
- Australia
- Europe
- Indian Ocean
- Pacific
- UTC

If you need to display multiple time zones, consider using multiple [Clock Widgets](CLOCK_WIDGET.md) configured with different timezones.
