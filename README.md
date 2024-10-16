# TypeORM Entity Type Interface Generator

A CLI tool to generate TypeScript interfaces from TypeORM entity classes.

## Installation

Install the package as a development dependency in your project:

```bash
npm install --save-dev typeorm-entity-type-interface
```

## Usage

Add a Script to Your package.json

```json
"scripts": {
  "generate-entity-interfaces": "typeorm-entity-type-interface -i ./src/entities -o ./src/interfaces"
}
```

#### Run the Script

```bash
npm run generate-interfaces
```

#### Command-Line Options

`-i, --input <path>: (Required) Input directory containing TypeORM entities.`

`-o, --output <path>: (Required) Output directory for generated interfaces.`

## Example
Generate interfaces from entities in `./src/entities/**.ts` and output them to `./src/interfaces`:

```bash
typeorm-entity-type-interface -i ./src/entities -o ./src/interfaces
```

## Features
**Generates Interfaces:** Creates TypeScript interfaces for each TypeORM entity.

**Include Relations:** Creates TypeScript interfaces for properties decorated with relation decorators (@OneToMany, @ManyToOne, etc.).

**Handles Optionals:** Correctly marks optional properties.

## Limitations
**Custom Types:** Complex or custom property types may require additional handling.

**Methods Ignored:** Only class properties are converted; methods are ignored.

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)