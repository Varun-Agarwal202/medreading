export default function handler(_req, res) {
  res.status(200).json({
    books: [
      {
        key: 'gifted_hands',
        title: 'Gifted Hands: The Ben Carson Story',
        author: 'Ben Carson with Cecil Murphey',
        pdfFilename:
          'Gifted hands  the Ben Carson story (Carson, Ben, Murphey, Cecil) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
      },
      {
        key: 'first_do_no_harm',
        title: 'First, Do No Harm',
        author: 'Lisa Belkin',
        pdfFilename: 'First, do no harm (Belkin, Lisa, 1960-) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
      },
      {
        key: 'tuesdays_with_morrie',
        title: 'Tuesdays with Morrie',
        author: 'Mitch Albom',
        pdfFilename:
          'Tuesdays with Morrie an old man, a young man, and life’s greatest lesson (Mitch Albom) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
      },
      {
        key: 'being_mortal',
        title: 'Being Mortal',
        author: 'Atul Gawande',
        pdfFilename: 'Being mortal (Gawande, Atul, author) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
      },
      {
        key: 'ultra_processed',
        title: 'Ultra-Processed People',
        author: 'Chris van Tulleken',
        pdfFilename:
          'Ultra-Processed People The Food We Eat That Isnt Food and Why We Cant Stop (Chris van Tulleken) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
      }
    ]
  });
}

