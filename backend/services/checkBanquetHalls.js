import mongoose from 'mongoose'
import Banquet from '../models/banquet.js'

const checkBanquetHalls = async () => {
    try {
        const banquets = await Banquet.find().sort({ _id: 1 })

        if (!banquets.length) {
            const banquetOne = new Banquet({
                name: 'Sheesh Mahal - S-M1',
                capacity: '100',
                area: '2000 sq ft',
                price: '5000',
                status: 'available',
                tags: ['wedding', 'party']
            })
            await banquetOne.save()
            const banquetTwo = new Banquet({
                name: 'Sheesh Mahal - S-M2',
                capacity: '200',
                area: '3000 sq ft',
                price: '7500',
                status: 'available',
                tags: ['corporate', 'event']
            })
            await banquetTwo.save()
            const banquetThree = new Banquet({
                name: 'Husnain Hall - H-H1',
                capacity: '400',
                area: '5000 sq ft',
                price: '10000',
                status: 'available',
                tags: ['wedding', 'corporate']
            })
            await banquetThree.save()
            await new Banquet({
                name: 'Husnain Hall - H-H2',
                capacity: '400',
                area: '5000 sq ft',
                price: '10000',
                status: 'available',
                tags: ['wedding', 'corporate']
            }).save()
            console.log('Default Banquet Halls Created')
        } else if (banquets.length < 4) {
            await new Banquet({
                name: 'Husnain Hall - H-H2',
                capacity: '400',
                area: '5000 sq ft',
                price: '10000',
                status: 'available',
                tags: ['wedding', 'corporate']
            }).save()
            console.log('Missing Husnain Hall H-H2 Created')
        }

        const publicNames = [
            'Sheesh Mahal - S-M1',
            'Sheesh Mahal - S-M2',
            'Husnain Hall - H-H1',
            'Husnain Hall - H-H2'
        ]
        const currentBanquets = await Banquet.find().sort({ _id: 1 })
        await Promise.all(currentBanquets.slice(0, publicNames.length).map((item, index) => {
            if (!item.name.startsWith('Banquet Hall ')) return Promise.resolve()
            item.name = publicNames[index]
            return item.save()
        }))
    } catch (error) {
        console.error('Error in Banquet:', error)
    }
}

export default checkBanquetHalls